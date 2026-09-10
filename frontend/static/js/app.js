// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
let currentUser          = null;
let allProducts          = [];
let allInventory         = [];
let allInventoryRequests = [];
let allUsers             = [];
let allBatches           = [];
let dashFilter           = { type: 'all', start: null, end: null };

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  setupLoginForm();
  setupNav();
  setupModal();
  setupActionButtons();
  setupDashFilters();
  if (localStorage.getItem(API.TOKEN_KEY)) initApp();
});

function setupLoginForm() {
  const toggle = document.getElementById('toggle-password');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const input = document.getElementById('login-password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.querySelector('.eye-open').style.display = show ? 'none' : '';
      toggle.querySelector('.eye-closed').style.display = show ? '' : 'none';
      const label = show ? 'Hide password' : 'Show password';
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('title', label);
    });
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    errEl.classList.remove('visible');
    btn.disabled = true; btn.textContent = 'Signing in\u2026';
    try {
      const { access_token } = await API.login(
        document.getElementById('login-username').value,
        document.getElementById('login-password').value,
      );
      localStorage.setItem(API.TOKEN_KEY, access_token);
      initApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('visible');
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });
}

async function initApp() {
  try { currentUser = await API.get('/users/me'); }
  catch { localStorage.removeItem(API.TOKEN_KEY); return; }

  applyBranding(currentUser.business);

  document.getElementById('sidebar-username').textContent = currentUser.name;
  document.getElementById('sidebar-role').textContent     = currentUser.role;
  document.querySelectorAll('.admin-only').forEach(el =>
    el.classList.toggle('hidden', currentUser.role !== 'admin')
  );
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');

  const hr = new Date().getHours();
  document.getElementById('dash-greeting').textContent =
    hr < 12 ? 'Good morning \u2600\ufe0f' : hr < 17 ? 'Good afternoon' : 'Good evening \ud83c\udf19';

  navigateTo('dashboard');
  updatePendingBadge();
}

// ═══════════════════════════════════════════════════════════════════════════
// BRANDING  (per-business logo, name, tagline & theme)
// ═══════════════════════════════════════════════════════════════════════════
const BRANDS = {
  okemzhub:    { logo: '/static/images/logo.svg',        sub: 'Inventory & Sales' },
  technext360: { logo: '/static/images/technext360.svg', sub: 'Inventory & Sales' },
};

function applyBranding(business) {
  const slug  = business?.slug || 'okemzhub';
  const brand = BRANDS[slug] || BRANDS.okemzhub;
  const name  = business?.name || 'OKEMZ HUB';

  document.documentElement.dataset.brand = slug;
  document.title = `${name} — Inventory & Sales`;

  // Login screen always shows both brands; only the sidebar rebrands per sister.
  const set = (id, fn) => { const el = getEl(id); if (el) fn(el); };
  set('sidebar-logo-img',  el => { el.src = brand.logo; el.alt = name; });
  set('sidebar-brand-name', el => el.textContent = name);
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function setupNav() {
  document.querySelectorAll('.nav-item[data-section]').forEach(btn =>
    btn.addEventListener('click', () => navigateTo(btn.dataset.section))
  );
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem(API.TOKEN_KEY); location.reload();
  });
}

function navigateTo(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.remove('hidden');
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
  ({
    dashboard:         loadDashboard,
    products:          loadProducts,
    inventory:         loadInventory,
    'stock-batches':   loadStockBatches,
    'stock-requests':  loadStockRequests,
    sales:             loadSales,
    expenses:          loadExpenses,
    users:             loadUsers,
    'activity-logs':   loadActivityLogs,
  })[name]?.();
}

// ═══════════════════════════════════════════════════════════════════════════
// BUTTON WIRING
// ═══════════════════════════════════════════════════════════════════════════
function setupActionButtons() {
  document.getElementById('btn-add-product')?.addEventListener('click', showAddProductModal);
  document.getElementById('btn-add-inventory')?.addEventListener('click', showAddInventoryModal);
  document.getElementById('btn-submit-stock-request')?.addEventListener('click', showSubmitStockRequestModal);
  document.getElementById('btn-record-sale')?.addEventListener('click', showRecordSaleModal);
  document.getElementById('btn-submit-expense')?.addEventListener('click', showSubmitExpenseModal);
  document.getElementById('btn-add-user')?.addEventListener('click', showAddUserModal);
  document.getElementById('btn-create-batch')?.addEventListener('click', showCreateBatchModal);
  document.getElementById('btn-refresh-logs')?.addEventListener('click', loadActivityLogs);
  document.getElementById('dark-toggle-btn')?.addEventListener('click', toggleDarkMode);
  document.getElementById('filter-inv-status')?.addEventListener('change', loadInventory);
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD FILTERS
// ═══════════════════════════════════════════════════════════════════════════
function setupDashFilters() {
  document.querySelectorAll('.qf-btn').forEach(btn =>
    btn.addEventListener('click', () => setQuickFilter(btn.dataset.range))
  );
  document.getElementById('apply-range-btn')?.addEventListener('click', () => {
    const from = val('filter-from'), to = val('filter-to');
    if (!from && !to) return;
    dashFilter.type  = 'custom';
    dashFilter.start = from ? new Date(from + 'T00:00:00') : null;
    dashFilter.end   = to   ? new Date(to   + 'T23:59:59') : null;
    document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
    loadDashboard();
  });
}

function setQuickFilter(range) {
  const now = new Date();
  dashFilter.type = range;
  switch (range) {
    case 'all':   dashFilter.start = null; dashFilter.end = null; break;
    case 'today':
      dashFilter.start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      dashFilter.end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case 'week': {
      const day = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0, 0, 0, 0);
      dashFilter.start = mon; dashFilter.end = now; break;
    }
    case 'month':
      dashFilter.start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      dashFilter.end   = now; break;
    case 'year':
      dashFilter.start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      dashFilter.end   = now; break;
  }
  document.querySelectorAll('.qf-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.range === range)
  );
  if (range !== 'custom') {
    const f = getEl('filter-from'), t = getEl('filter-to');
    if (f) f.value = ''; if (t) t.value = '';
  }
  loadDashboard();
}

function filterByDate(items, dateField) {
  if (!dashFilter.start && !dashFilter.end) return items;
  return items.filter(i => {
    const d = new Date(i[dateField]);
    return (!dashFilter.start || d >= dashFilter.start) &&
           (!dashFilter.end   || d <= dashFilter.end);
  });
}

function updatePeriodLabel() {
  const labels = {
    all: 'All Time', today: 'Today', week: 'This Week',
    month: 'This Month', year: 'This Year',
    custom: (dashFilter.start && dashFilter.end)
      ? `${dashFilter.start.toLocaleDateString('en-GB')} \u2014 ${dashFilter.end.toLocaleDateString('en-GB')}`
      : 'Custom Range',
  };
  const el = getEl('period-section-label');
  if (el) {
    const store = currentUser?.business?.name || 'Your';
    el.innerHTML = `${escHtml(store)} Finance \u2014 ${labels[dashFilter.type] ?? ''} ` +
      `<span class="dash-scope-tag private">Private to you</span>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════════
function setupModal() {
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function openModal(title, bodyHTML, onConfirm, confirmLabel = 'Save', confirmClass = 'btn-primary') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHTML;
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn  = document.getElementById('modal-cancel');
  if (onConfirm) {
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className   = `btn ${confirmClass}`;
    confirmBtn.onclick     = onConfirm;
    confirmBtn.classList.remove('hidden');
    cancelBtn.textContent  = 'Cancel';
  } else {
    confirmBtn.classList.add('hidden');
    cancelBtn.textContent = 'Close';
  }
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-confirm').classList.remove('hidden');
  document.getElementById('modal-cancel').textContent = 'Cancel';
  document.querySelector('.modal')?.classList.remove('modal-lg');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const fmtMoney = v =>
  '\u20a6' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';

const badge = s => `<span class="badge badge-${s}">${s}</span>`;

const emptyRow = (cols, msg = 'No records found.') =>
  `<tr><td colspan="${cols}"><div class="empty-state">
    <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>${msg}</p></div></td></tr>`;

const getEl = id => document.getElementById(id);
const setEl = (id, text) => { const el = getEl(id); if (el) el.textContent = text; };
const val   = id => getEl(id)?.value ?? '';
const flt   = id => parseFloat(val(id)) || 0;
const int   = id => parseInt(val(id))   || 0;

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    const isAdmin = currentUser?.role === 'admin';
    const [inventory, sales, expenses, products, requests, batches] = await Promise.all([
      API.get('/inventory/'), API.get('/sales/'),
      API.get('/expenses/'),  API.get('/products/'),
      API.get('/inventory-requests/').catch(() => []),
      isAdmin ? API.get('/stock-batches/').catch(() => []) : Promise.resolve([]),
    ]);
    allInventory = inventory; allProducts = products;
    allInventoryRequests = requests;

    // Shared stock stats — common to both stores, always live, not filtered
    getEl('stat-products').textContent  = products.length;
    getEl('stat-available').textContent = inventory.filter(i => i.status === 'available').length;
    getEl('stat-faulty').textContent    = inventory.filter(i => i.status === 'faulty').length;
    setEl('stat-batches',  batches.length);
    setEl('stat-requests', requests.filter(r => r.status === 'pending').length);

    // Period stats — filtered by dashFilter
    const fSales = filterByDate(sales, 'date_sold');
    const fExp   = filterByDate(expenses, 'date');
    const revenue    = fSales.reduce((s, x) => s + Number(x.selling_price), 0);
    const expTotal   = fExp.filter(e => e.status === 'approved').reduce((s, x) => s + Number(x.amount), 0);
    const pendingExp = fExp.filter(e => e.status === 'pending').length;

    getEl('stat-revenue').textContent        = fmtMoney(revenue);
    getEl('stat-sales-count').textContent    = `${fSales.length} transaction${fSales.length !== 1 ? 's' : ''}`;
    getEl('stat-sold').textContent           = fSales.length;
    getEl('stat-expenses-total').textContent = fmtMoney(expTotal);
    getEl('stat-pending-exp').textContent    = pendingExp;
    updatePeriodLabel();

    // Recent sales
    const productMap = Object.fromEntries(products.map(p => [p.id, `${p.brand} ${p.model_name}`]));
    const sRows = [...fSales].reverse().slice(0, 8).map(s => {
      const unit = inventory.find(i => i.id === s.inventory_item_id);
      return `<tr>
        <td class="font-mono text-xs text-muted">#${s.id}</td>
        <td>${productMap[unit?.product_id] ?? `Unit #${s.inventory_item_id}`}</td>
        <td><strong>${fmtMoney(s.selling_price)}</strong></td>
        <td class="text-muted text-sm">${fmtDate(s.date_sold)}</td></tr>`;
    }).join('') || emptyRow(4, 'No sales in this period.');
    getEl('dashboard-recent-sales').innerHTML =
      `<table><thead><tr><th>Sale #</th><th>Product</th><th>Amount</th><th>Date</th></tr></thead><tbody>${sRows}</tbody></table>`;

    // Recent expenses
    const eRows = [...fExp].reverse().slice(0, 8).map(e => `
      <tr>
        <td class="font-mono text-xs text-muted">#${e.id}</td>
        <td class="text-sm">${e.submitted_by?.name ?? `User #${e.submitted_by_user_id}`}</td>
        <td><strong>${fmtMoney(e.amount)}</strong></td>
        <td class="text-sm">${e.description}</td>
        <td>${badge(e.status)}</td></tr>`
    ).join('') || emptyRow(5, 'No expenses in this period.');
    getEl('dashboard-recent-expenses').innerHTML =
      `<table><thead><tr><th>Exp #</th><th>From</th><th>Amount</th><th>Description</th><th>Status</th></tr></thead><tbody>${eRows}</tbody></table>`;
  } catch (err) {
    toast('Failed to load dashboard: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════
async function loadProducts() {
  getEl('products-table').innerHTML = '<div class="loading">Loading products</div>';
  try {
    allProducts = await API.get('/products/');
    const isAdmin = currentUser?.role === 'admin';
    const rows = allProducts.map(p => `
      <tr>
        <td><strong>${p.brand}</strong></td>
        <td>${p.model_name}</td>
        <td><strong>${fmtMoney(p.base_price)}</strong></td>
        <td class="text-muted text-sm" style="max-width:260px;white-space:pre-wrap">${p.specifications ?? '\u2014'}</td>
        ${isAdmin ? `<td><div class="flex gap-1">
          <button class="btn-icon" onclick="showEditProductModal(${p.id})" title="Edit">\u270f\ufe0f</button>
          <button class="btn-icon icon-danger" onclick="deleteProduct(${p.id})" title="Delete">\ud83d\uddd1</button>
        </div></td>` : ''}
      </tr>`).join('') || emptyRow(isAdmin ? 5 : 4, 'No products yet.');
    getEl('products-table').innerHTML = `<table>
      <thead><tr><th>Brand</th><th>Model</th><th>Base Price</th><th>Specifications</th>${isAdmin ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch (err) { toast('Failed to load products: ' + err.message, 'error'); }
}

function productFormHTML(p = {}) {
  return `
    <div class="form-group"><label>Brand</label>
      <input id="f-brand" type="text" placeholder="e.g. Apple" value="${p.brand ?? ''}"></div>
    <div class="form-group"><label>Model Name</label>
      <input id="f-model" type="text" placeholder="e.g. MacBook Pro M3 14-inch" value="${p.model_name ?? ''}"></div>
    <div class="form-group"><label>Base Price (\u20a6)</label>
      <input id="f-price" type="number" step="0.01" min="0" value="${p.base_price ?? ''}"></div>
    <div class="form-group"><label>Specifications <span class="text-muted">(free text, optional)</span></label>
      <textarea id="f-specs" placeholder="e.g. 16GB RAM, 512GB SSD, Apple M3 chip, 14-inch Retina display, Space Grey">${p.specifications ?? ''}</textarea></div>`;
}

function readProductPayload() {
  return {
    brand: val('f-brand'), model_name: val('f-model'),
    base_price: flt('f-price'), specifications: val('f-specs').trim() || null,
  };
}

function showAddProductModal() {
  openModal('Add Product', productFormHTML(), async () => {
    try {
      await API.post('/products/', readProductPayload());
      toast('Product added', 'success'); closeModal(); loadProducts();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });
}

function showEditProductModal(id) {
  const p = allProducts.find(x => x.id === id); if (!p) return;
  openModal('Edit Product', productFormHTML(p), async () => {
    try {
      await API.put(`/products/${id}`, readProductPayload());
      toast('Product updated', 'success'); closeModal(); loadProducts();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }, 'Save Changes');
}

async function deleteProduct(id) {
  if (!confirm('Delete this product from the catalog?')) return;
  try { await API.delete(`/products/${id}`); toast('Deleted', 'success'); loadProducts(); }
  catch (err) { toast('Error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY  (admin direct-add; staff use Stock Requests)
// ═══════════════════════════════════════════════════════════════════════════
// Shared "who sold it" cell — shows the seller (name + store) for units that are
// no longer available, so both sisters can see who picked a sold unit. No prices.
function soldByCell(i) {
  if (i.status !== 'sold') return '<span class="text-muted">\u2014</span>';
  if (!i.sold_by_name) return '<span class="text-muted">\u2014</span>';
  const store = i.sold_by_business
    ? ` <span class="badge badge-staff">${escHtml(i.sold_by_business)}</span>`
    : '';
  return `${escHtml(i.sold_by_name)}${store}`;
}

async function loadInventory() {
  getEl('inventory-table').innerHTML = '<div class="loading">Loading inventory</div>';
  const sf      = val('filter-inv-status');
  const isAdmin = currentUser?.role === 'admin';
  try {
    allInventory = await API.get('/inventory/' + (sf ? `?item_status=${sf}` : ''));
    if (isAdmin && !allBatches.length) allBatches = await API.get('/stock-batches/').catch(() => []);
    // oldest first so FIFO order is visible
    allInventory.sort((a, b) => new Date(a.date_added) - new Date(b.date_added));
    const productMap = Object.fromEntries(allProducts.map(p => [p.id, `${p.brand} ${p.model_name}`]));
    const cols = isAdmin ? 9 : 7;
    const rows = allInventory.map(i => `
      <tr>
        <td class="font-mono text-sm">${escHtml(i.serial_number)}</td>
        <td>${productMap[i.product_id] ?? `Product #${i.product_id}`}</td>
        ${isAdmin ? `<td>${batchBadge(i.stock_batch_id)}</td>` : ''}
        <td>${badge(i.status)}</td>
        <td class="text-sm">${soldByCell(i)}</td>
        ${isAdmin ? `<td class="text-sm">${i.cost_price ? fmtMoney(i.cost_price) : '<span class="text-muted">\u2014</span>'}</td>` : ''}
        <td class="text-muted text-sm" style="max-width:180px">${i.fault_description ? escHtml(i.fault_description) : '\u2014'}</td>
        <td class="text-muted text-sm">${fmtDate(i.date_added)}</td>
        <td><div class="flex gap-1">
          <button class="btn-icon" onclick="showEditInventoryModal(${i.id})" title="Update">\u270f\ufe0f</button>
          ${isAdmin ? `<button class="btn-icon icon-danger" onclick="deleteInventoryItem(${i.id})" title="Delete">\ud83d\uddd1</button>` : ''}
        </div></td>
      </tr>`).join('') || emptyRow(cols);
    const ah = isAdmin ? '<th>Batch</th><th>Cost \u20a6</th>' : '';
    getEl('inventory-table').innerHTML = `<table>
      <thead><tr><th>Serial #</th><th>Product</th>${ah}<th>Status</th><th>Sold By</th><th>Fault Note</th><th>Date Added</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch (err) { toast('Failed to load inventory: ' + err.message, 'error'); }
}

async function showAddInventoryModal() {
  if (!allProducts.length) allProducts = await API.get('/products/').catch(() => []);
  if (!allProducts.length) { toast('Add at least one product first.', 'error'); return; }
  allBatches = await API.get('/stock-batches/').catch(() => []);
  const productOpts = allProducts.map(p => `<option value="${p.id}">${p.brand} ${p.model_name}</option>`).join('');
  const batchOpts = `<option value="">— No batch —</option>` + allBatches.map(b =>
    `<option value="${b.id}">${escHtml(b.label)}</option>`
  ).join('');
  openModal('Add Unit to Inventory', `
    <div class="form-group"><label>Product</label><select id="f-product">${productOpts}</select></div>
    <div class="form-group"><label>Serial Number</label>
      <input id="f-serial" type="text" placeholder="e.g. C02XK1JHJGH7"></div>
    <div class="form-row">
      <div class="form-group"><label>Stock Batch <span class="text-muted">(optional)</span></label>
        <select id="f-batch">${batchOpts}</select></div>
      <div class="form-group"><label>Cost Price ₦ <span class="text-muted">(optional)</span></label>
        <input id="f-cost" type="number" step="0.01" min="0" placeholder="0.00"></div>
    </div>
    <div class="form-group"><label>Status</label>
      <select id="f-status" onchange="toggleFaultField()">
        <option value="available">Available</option>
        <option value="faulty">Faulty</option>
      </select></div>
    <div class="form-group hidden" id="fault-group"><label>Fault Description</label>
      <textarea id="f-fault"></textarea></div>`,
  async () => {
    try {
      const status = val('f-status');
      await API.post('/inventory/', {
        product_id: int('f-product'), serial_number: val('f-serial'),
        status, fault_description: status === 'faulty' ? val('f-fault') : null,
        stock_batch_id: int('f-batch') || null,
        cost_price: flt('f-cost') || null,
      });
      toast('Unit added', 'success'); closeModal(); loadInventory();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });
}

function toggleFaultField() {
  getEl('fault-group')?.classList.toggle('hidden', getEl('f-status')?.value !== 'faulty');
}

async function showEditInventoryModal(id) {
  const item    = allInventory.find(x => x.id === id); if (!item) return;
  const isAdmin = currentUser?.role === 'admin';
  if (isAdmin) allBatches = await API.get('/stock-batches/').catch(() => []);
  const batchOpts = isAdmin
    ? `<option value="">\u2014 No batch \u2014</option>` + allBatches.map(b =>
        `<option value="${b.id}" ${b.id === item.stock_batch_id ? 'selected' : ''}>${escHtml(b.label)}</option>`
      ).join('')
    : '';
  const adminFields = isAdmin ? `
    <div class="form-row">
      <div class="form-group"><label>Stock Batch</label>
        <select id="f-batch">${batchOpts}</select></div>
      <div class="form-group"><label>Cost Price \u20a6</label>
        <input id="f-cost" type="number" step="0.01" min="0" value="${item.cost_price ?? ''}"></div>
    </div>` : '';
  openModal(`Update Unit \u2014 ${escHtml(item.serial_number)}`, `
    <div class="form-group"><label>Status</label>
      <select id="f-status" onchange="toggleFaultField()">
        <option value="available" ${item.status === 'available' ? 'selected' : ''}>Available</option>
        <option value="sold"      ${item.status === 'sold'      ? 'selected' : ''}>Sold</option>
        <option value="faulty"    ${item.status === 'faulty'    ? 'selected' : ''}>Faulty</option>
      </select></div>
    <div class="form-group ${item.status !== 'faulty' ? 'hidden' : ''}" id="fault-group">
      <label>Fault Description</label>
      <textarea id="f-fault">${item.fault_description ?? ''}</textarea></div>
    ${adminFields}`,
  async () => {
    try {
      const status  = val('f-status');
      const payload = { status, fault_description: status === 'faulty' ? val('f-fault') : null };
      if (isAdmin) {
        payload.stock_batch_id = int('f-batch') || null;
        payload.cost_price     = flt('f-cost') || null;
      }
      await API.patch(`/inventory/${id}`, payload);
      toast('Unit updated', 'success'); closeModal(); loadInventory();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }, 'Update');
}

async function deleteInventoryItem(id) {
  if (!confirm('Permanently delete this unit?')) return;
  try { await API.delete(`/inventory/${id}`); toast('Deleted', 'success'); loadInventory(); }
  catch (err) { toast('Error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK REQUESTS  (staff submit \u2192 admin approves \u2192 inventory item created)
// ═══════════════════════════════════════════════════════════════════════════
async function loadStockRequests() {
  getEl('stock-requests-table').innerHTML = '<div class="loading">Loading requests</div>';
  try {
    allInventoryRequests = await API.get('/inventory-requests/');
    const isAdmin = currentUser?.role === 'admin';
    if (!allProducts.length) allProducts = await API.get('/products/').catch(() => []);

    const rows = allInventoryRequests.map(r => `
      <tr>
        <td class="font-mono text-xs text-muted">#${r.id}</td>
        <td>${r.product ? `${r.product.brand} ${r.product.model_name}` : `Product #${r.product_id}`}</td>
        <td class="font-mono text-sm">${r.serial_number}</td>
        <td class="text-sm">${r.requested_by?.name ?? `User #${r.requested_by_user_id}`}</td>
        <td>${badge(r.status)}</td>
        <td class="text-muted text-sm" style="max-width:180px">${r.rejection_reason ?? '\u2014'}</td>
        <td class="text-muted text-sm">${fmtDate(r.date_requested)}</td>
        <td>${isAdmin && r.status === 'pending' ? `
          <div class="flex gap-1">
            <button class="btn btn-success btn-xs" onclick="reviewStockRequest(${r.id},'approved')">\u2713 Approve</button>
            <button class="btn btn-danger  btn-xs" onclick="reviewStockRequest(${r.id},'rejected')">\u2717 Reject</button>
          </div>` : '<span class="text-muted text-xs">\u2014</span>'}</td>
      </tr>`).join('') || emptyRow(8, 'No stock requests yet.');

    getEl('stock-requests-table').innerHTML = `<table>
      <thead><tr><th>#</th><th>Product</th><th>Serial #</th><th>Submitted By</th><th>Status</th><th>Rejection Reason</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    updatePendingBadge();
  } catch (err) { toast('Failed to load requests: ' + err.message, 'error'); }
}

async function showSubmitStockRequestModal() {
  if (!allProducts.length) allProducts = await API.get('/products/').catch(() => []);
  if (!allProducts.length) { toast('No products in catalog. Ask admin to add products first.', 'error'); return; }
  const opts = allProducts.map(p => `<option value="${p.id}">${p.brand} ${p.model_name}</option>`).join('');
  openModal('Submit Stock Request', `
    <p class="form-hint" style="margin-bottom:1rem">Your request will be reviewed by the admin before the unit appears in inventory.</p>
    <div class="form-group"><label>Product</label><select id="f-product">${opts}</select></div>
    <div class="form-group"><label>Serial Number</label>
      <input id="f-serial" type="text" placeholder="e.g. C02XK1JHJGH7"></div>
    <div class="form-group"><label>Condition Notes <span class="text-muted">(optional)</span></label>
      <textarea id="f-fault" placeholder="Any notes about the unit\u2019s condition\u2026"></textarea></div>`,
  async () => {
    try {
      await API.post('/inventory-requests/', {
        product_id: int('f-product'), serial_number: val('f-serial'),
        fault_description: val('f-fault').trim() || null,
      });
      toast('Request submitted \u2014 awaiting admin approval', 'success');
      closeModal(); loadStockRequests();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }, 'Submit Request');
}

async function reviewStockRequest(id, action) {
  const req = allInventoryRequests.find(r => r.id === id);
  if (action === 'rejected') {
    openModal('Reject Request', `
      <p class="form-hint" style="margin-bottom:1rem">Provide a reason for rejecting this stock request.</p>
      <div class="form-group"><label>Rejection Reason</label>
        <textarea id="f-reason" placeholder="e.g. Incorrect serial number format…"></textarea></div>`,
    async () => {
      const reason = val('f-reason').trim();
      if (!reason) { toast('Rejection reason is required.', 'error'); return; }
      try {
        await API.patch(`/inventory-requests/${id}/review`, { status: 'rejected', rejection_reason: reason });
        toast('Request rejected', 'info'); closeModal(); loadStockRequests();
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    }, 'Reject', 'btn-danger');
  } else {
    allBatches = await API.get('/stock-batches/').catch(() => []);
    const batchOpts = `<option value="">— No batch —</option>` + allBatches.map(b =>
      `<option value="${b.id}">${escHtml(b.label)}</option>`
    ).join('');
    openModal('Approve Stock Request', `
      <p class="form-hint" style="margin-bottom:1rem">
        Unit <strong>${escHtml(req?.serial_number ?? '#' + id)}</strong> will be added to inventory as <strong>Available</strong>.
      </p>
      <div class="form-row">
        <div class="form-group"><label>Assign to Batch <span class="text-muted">(optional)</span></label>
          <select id="f-batch">${batchOpts}</select></div>
        <div class="form-group"><label>Cost Price ₦ <span class="text-muted">(optional)</span></label>
          <input id="f-cost" type="number" step="0.01" min="0" placeholder="0.00"></div>
      </div>`,
    async () => {
      try {
        await API.patch(`/inventory-requests/${id}/review`, {
          status: 'approved',
          stock_batch_id: int('f-batch') || null,
          cost_price: flt('f-cost') || null,
        });
        toast('Approved — unit added to inventory ✓', 'success');
        closeModal(); loadStockRequests(); loadInventory();
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    }, 'Approve', 'btn-success');
  }
}

async function updatePendingBadge() {
  try {
    if (!allInventoryRequests.length) allInventoryRequests = await API.get('/inventory-requests/');
  } catch { return; }
  const count = allInventoryRequests.filter(r => r.status === 'pending').length;
  const el = getEl('nav-pending-badge');
  if (el) { el.textContent = count || ''; el.classList.toggle('hidden', count === 0); }
}

// ═══════════════════════════════════════════════════════════════════════════
// SALES
// ═══════════════════════════════════════════════════════════════════════════
async function loadSales() {
  getEl('sales-table').innerHTML = '<div class="loading">Loading sales</div>';
  try {
    const sales   = await API.get('/sales/');
    const isAdmin = currentUser?.role === 'admin';
    const productMap = Object.fromEntries(allProducts.map(p => [p.id, `${p.brand} ${p.model_name}`]));
    const rows = sales.map(s => {
      const unit = allInventory.find(i => i.id === s.inventory_item_id);
      return `<tr>
        <td class="font-mono text-xs text-muted">#${s.id}</td>
        <td>${productMap[unit?.product_id] ?? 'Product #?'}</td>
        <td class="font-mono text-sm text-muted">${unit?.serial_number ?? '\u2014'}</td>
        <td><strong>${fmtMoney(s.selling_price)}</strong></td>
        <td class="text-muted text-sm">${fmtDate(s.date_sold)}</td>
        ${isAdmin ? `<td>
          <button class="btn btn-ghost btn-xs" onclick="reverseSale(${s.id})">\u27f2 Reverse</button>
        </td>` : ''}
      </tr>`;
    }).join('') || emptyRow(isAdmin ? 6 : 5, 'No sales yet.');
    getEl('sales-table').innerHTML = `<table>
      <thead><tr><th>Sale #</th><th>Product</th><th>Serial #</th><th>Amount</th><th>Date</th>${isAdmin ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch (err) { toast('Failed to load sales: ' + err.message, 'error'); }
}

async function showRecordSaleModal() {
  const available = await API.get('/inventory/?item_status=available').catch(() => []);
  if (!available.length) { toast('No units currently available in stock.', 'error'); return; }
  if (!allProducts.length) allProducts = await API.get('/products/').catch(() => []);
  const productMap = Object.fromEntries(allProducts.map(p => [p.id, `${p.brand} ${p.model_name}`]));
  const opts = available.map(i =>
    `<option value="${i.id}">${productMap[i.product_id] ?? 'Product #' + i.product_id}  \u2014  ${i.serial_number}</option>`
  ).join('');
  openModal('Record Sale', `
    <div class="form-group"><label>Select Unit to Sell</label><select id="f-item">${opts}</select></div>
    <div class="form-group"><label>Selling Price (\u20a6)</label>
      <input id="f-price" type="number" step="0.01" min="0" placeholder="0.00"></div>
    <p class="form-hint">The unit will automatically be marked as <strong>Sold</strong>.</p>`,
  async () => {
    try {
      await API.post('/sales/', { inventory_item_id: int('f-item'), selling_price: flt('f-price') });
      toast('Sale recorded \u2014 unit marked as Sold \u2713', 'success');
      closeModal(); loadSales(); loadInventory();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }, 'Record Sale', 'btn-success');
}

async function reverseSale(id) {
  if (!confirm('Reverse this sale? The unit will be restored to Available.')) return;
  try {
    await API.delete(`/sales/${id}`);
    toast('Sale reversed \u2014 unit restored to Available', 'success'); loadSales(); loadInventory();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════════════════════
async function loadExpenses() {
  getEl('expenses-table').innerHTML = '<div class="loading">Loading expenses</div>';
  try {
    const expenses = await API.get('/expenses/');
    const isAdmin  = currentUser?.role === 'admin';
    const rows = expenses.map(e => `
      <tr>
        <td class="font-mono text-xs text-muted">#${e.id}</td>
        <td class="text-sm"><strong>${e.submitted_by?.name ?? `User #${e.submitted_by_user_id}`}</strong></td>
        <td><strong>${fmtMoney(e.amount)}</strong></td>
        <td class="text-sm">${e.description}</td>
        <td>${badge(e.status)}</td>
        <td class="text-muted text-sm">${fmtDate(e.date)}</td>
        ${isAdmin ? `<td>${e.status === 'pending' ? `
          <div class="flex gap-1">
            <button class="btn btn-success btn-xs" onclick="updateExpenseStatus(${e.id},'approved')">\u2713 Approve</button>
            <button class="btn btn-danger  btn-xs" onclick="updateExpenseStatus(${e.id},'rejected')">\u2717 Reject</button>
          </div>` : `<span class="text-muted text-xs">\u2014</span>`}</td>` : ''}
      </tr>`).join('') || emptyRow(isAdmin ? 7 : 6, 'No expenses yet.');
    getEl('expenses-table').innerHTML = `<table>
      <thead><tr><th>Exp #</th><th>Submitted By</th><th>Amount</th><th>Description</th><th>Status</th><th>Date</th>${isAdmin ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch (err) { toast('Failed to load expenses: ' + err.message, 'error'); }
}

function showSubmitExpenseModal() {
  openModal('Submit Expense', `
    <div class="form-group"><label>Amount (\u20a6)</label>
      <input id="f-amount" type="number" step="0.01" min="0" placeholder="0.00"></div>
    <div class="form-group"><label>Description</label>
      <textarea id="f-desc" placeholder="What is this expense for?"></textarea></div>
    <p class="form-hint" id="exp-hint"></p>`,
  async () => {
    try {
      await API.post('/expenses/', { amount: flt('f-amount'), description: val('f-desc') });
      const msg = currentUser?.role === 'admin'
        ? 'Expense recorded (auto-approved)' : 'Expense submitted for review';
      toast(msg, 'success'); closeModal(); loadExpenses();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }, 'Submit');
  setTimeout(() => {
    const h = getEl('exp-hint');
    if (h) h.textContent = currentUser?.role === 'admin'
      ? 'As admin, this expense will be auto-approved immediately.'
      : 'Your expense will be Pending until reviewed by an admin.';
  }, 0);
}

async function updateExpenseStatus(id, status) {
  try {
    await API.patch(`/expenses/${id}/status`, { status });
    toast(`Expense ${status}`, status === 'approved' ? 'success' : 'info');
    loadExpenses();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// USERS  (admin-only)
// ═══════════════════════════════════════════════════════════════════════════
async function loadUsers() {
  getEl('users-table').innerHTML = '<div class="loading">Loading accounts</div>';
  try {
    allUsers = await API.get('/users/');
    const rows = allUsers.map(u => `
      <tr>
        <td class="font-mono text-xs text-muted">#${u.id}</td>
        <td><strong>${u.name}</strong></td>
        <td class="font-mono text-sm">${u.username}</td>
        <td>${badge(u.role)}</td>
        <td class="text-sm">${u.monthly_sales_target ? fmtMoney(u.monthly_sales_target) : '\u2014'}</td>
        <td><div class="flex gap-1">
          <button class="btn-icon" onclick="showEditUserModal(${u.id})" title="Edit">\u270f\ufe0f</button>
          <button class="btn-icon icon-danger" onclick="deleteUser(${u.id})" title="Delete">\ud83d\uddd1</button>
        </div></td>
      </tr>`).join('') || emptyRow(6, 'No accounts found.');
    getEl('users-table').innerHTML = `<table>
      <thead><tr><th>#</th><th>Name</th><th>Username</th><th>Role</th><th>Monthly Target</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch (err) { toast('Failed to load users: ' + err.message, 'error'); }
}

function userFormHTML(u = {}) {
  return `
    <div class="form-group"><label>Full Name</label>
      <input id="f-name" type="text" placeholder="e.g. Amaka Johnson" value="${u.name ?? ''}"></div>
    <div class="form-group"><label>Username</label>
      <input id="f-username" type="text" placeholder="e.g. amaka_j" value="${u.username ?? ''}"
        ${u.id ? 'readonly style="opacity:.6"' : ''}></div>
    ${!u.id ? `<div class="form-group"><label>Password</label>
      <input id="f-password" type="password" placeholder="Minimum 8 characters"></div>` : ''}
    <div class="form-row">
      <div class="form-group"><label>Role</label>
        <select id="f-role">
          <option value="staff" ${u.role !== 'admin' ? 'selected' : ''}>Staff</option>
          <option value="admin" ${u.role === 'admin'  ? 'selected' : ''}>Admin</option>
        </select></div>
      <div class="form-group"><label>Monthly Sales Target (\u20a6)</label>
        <input id="f-target" type="number" step="0.01" min="0" placeholder="optional"
          value="${u.monthly_sales_target ?? ''}"></div>
    </div>`;
}

function showAddUserModal() {
  openModal('Add Staff Account', userFormHTML(), async () => {
    try {
      const target = val('f-target');
      await API.post('/users/', {
        name: val('f-name'), username: val('f-username'),
        password: val('f-password'), role: val('f-role'),
        monthly_sales_target: target ? flt('f-target') : null,
      });
      toast('Account created', 'success'); closeModal(); loadUsers();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });
}

function showEditUserModal(id) {
  const u = allUsers.find(x => x.id === id); if (!u) return;
  openModal(`Edit \u2014 ${u.name}`, userFormHTML(u), async () => {
    try {
      const target = val('f-target');
      await API.put(`/users/${id}`, {
        name: val('f-name'), role: val('f-role'),
        monthly_sales_target: target ? flt('f-target') : null,
      });
      toast('Account updated', 'success'); closeModal(); loadUsers();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }, 'Save Changes');
}

async function deleteUser(id) {
  if (id === currentUser?.id) { toast("You can't delete your own account.", 'error'); return; }
  if (!confirm('Delete this user account?')) return;
  try { await API.delete(`/users/${id}`); toast('Account deleted', 'success'); loadUsers(); }
  catch (err) { toast('Error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════════════════════════════════
const MOON_SVG = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SUN_SVG  = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function initDarkMode() {
  const isDark = localStorage.getItem('okemzhub_theme') === 'dark';
  if (isDark) document.documentElement.dataset.theme = 'dark';
  updateDarkToggleIcon(isDark);
}

function toggleDarkMode() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  if (isDark) {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem('okemzhub_theme');
  } else {
    document.documentElement.dataset.theme = 'dark';
    localStorage.setItem('okemzhub_theme', 'dark');
  }
  updateDarkToggleIcon(!isDark);
}

function updateDarkToggleIcon(isDark) {
  const btn = getEl('dark-toggle-btn'); if (!btn) return;
  btn.innerHTML = isDark ? SUN_SVG : MOON_SVG;
  btn.title     = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK BATCHES  (admin-only — cost & batch tracking)
// ═══════════════════════════════════════════════════════════════════════════
const escHtml   = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const batchBadge = id => {
  if (!id) return '<span class="text-muted text-xs">\u2014</span>';
  const b = allBatches.find(x => x.id === id);
  return b ? `<span class="badge badge-batch">${escHtml(b.label)}</span>` : `<span class="text-muted text-xs">#${id}</span>`;
};

async function loadStockBatches() {
  getEl('stock-batches-table').innerHTML = '<div class="loading">Loading batches</div>';
  try {
    allBatches = await API.get('/stock-batches/');
    const rows = allBatches.map(b => `
      <tr>
        <td><strong>${escHtml(b.label)}</strong></td>
        <td class="text-sm text-muted">${fmtDate(b.date_received)}</td>
        <td class="text-sm">${b.unit_count} unit${b.unit_count !== 1 ? 's' : ''}</td>
        <td><strong>${fmtMoney(b.total_unit_cost)}</strong></td>
        <td class="text-muted text-sm">${fmtMoney(b.shipping_fee)}</td>
        <td class="text-muted text-sm">${fmtMoney(b.other_expenses)}</td>
        <td><strong>${fmtMoney(b.total_landed_cost)}</strong></td>
        <td><div class="flex gap-1">
          <button class="btn btn-ghost btn-xs" onclick="showBatchDetailModal(${b.id})">\ud83d\udccb View</button>
          <button class="btn-icon" onclick="showEditBatchModal(${b.id})" title="Edit">\u270f\ufe0f</button>
          <button class="btn-icon icon-danger" onclick="deleteBatch(${b.id})" title="Delete">\ud83d\uddd1</button>
        </div></td>
      </tr>`).join('') || emptyRow(8, 'No stock batches yet. Create one to start tracking received stock.');
    getEl('stock-batches-table').innerHTML = `<table>
      <thead><tr>
        <th>Batch Label</th><th>Date Received</th><th>Units</th>
        <th>Unit Cost Total</th><th>Shipping Fee</th><th>Other Expenses</th>
        <th>Total Landed Cost</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch (err) { toast('Failed to load stock batches: ' + err.message, 'error'); }
}

function batchFormHTML(b = {}) {
  const dateVal = b.date_received ? String(b.date_received).split('T')[0] : '';
  return `
    <div class="form-group"><label>Batch Label</label>
      <input id="f-label" type="text" placeholder="e.g. January 2026 Shipment" value="${escHtml(b.label ?? '')}">
      <p class="form-hint">A descriptive name so you can identify this stock batch easily.</p></div>
    <div class="form-group"><label>Date Received</label>
      <input id="f-date" type="date" value="${dateVal}"></div>
    <div class="form-row">
      <div class="form-group"><label>Shipping Fee \u20a6</label>
        <input id="f-shipping" type="number" step="0.01" min="0" value="${b.shipping_fee ?? '0'}"></div>
      <div class="form-group"><label>Other Expenses \u20a6</label>
        <input id="f-other" type="number" step="0.01" min="0" value="${b.other_expenses ?? '0'}">
        <p class="form-hint">Customs, handling, clearing, etc.</p></div>
    </div>
    <div class="form-group"><label>Notes <span class="text-muted">(optional)</span></label>
      <textarea id="f-notes" placeholder="Additional notes about this stock batch\u2026">${escHtml(b.notes ?? '')}</textarea></div>`;
}

function showCreateBatchModal() {
  openModal('Create Stock Batch', batchFormHTML(), async () => {
    try {
      await API.post('/stock-batches/', {
        label: val('f-label'), date_received: val('f-date'),
        shipping_fee: flt('f-shipping'), other_expenses: flt('f-other'),
        notes: val('f-notes').trim() || null,
      });
      toast('Batch created', 'success'); closeModal(); loadStockBatches();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  });
}

function showEditBatchModal(id) {
  const b = allBatches.find(x => x.id === id); if (!b) return;
  openModal(`Edit Batch \u2014 ${escHtml(b.label)}`, batchFormHTML(b), async () => {
    try {
      await API.put(`/stock-batches/${id}`, {
        label: val('f-label'), date_received: val('f-date'),
        shipping_fee: flt('f-shipping'), other_expenses: flt('f-other'),
        notes: val('f-notes').trim() || null,
      });
      toast('Batch updated', 'success'); closeModal(); loadStockBatches();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }, 'Save Changes');
}

async function showBatchDetailModal(id) {
  try {
    const b = await API.get(`/stock-batches/${id}`);
    if (!allProducts.length) allProducts = await API.get('/products/').catch(() => []);
    const productMap = Object.fromEntries(allProducts.map(p => [p.id, `${p.brand} ${p.model_name}`]));
    const itemRows = (b.items || []).map(i => `
      <tr>
        <td class="font-mono text-sm">${escHtml(i.serial_number)}</td>
        <td class="text-sm">${productMap[i.product_id] ?? 'Product #' + i.product_id}</td>
        <td class="text-sm">${i.cost_price ? `<strong>${fmtMoney(i.cost_price)}</strong>` : '<span class="text-muted">\u2014</span>'}</td>
        <td>${badge(i.status)}</td>
        <td class="text-muted text-sm">${fmtDate(i.date_added)}</td>
      </tr>`).join('') || emptyRow(5, 'No units assigned to this batch yet.');
    document.querySelector('.modal')?.classList.add('modal-lg');
    openModal(`Batch: ${escHtml(b.label)}`, `
      <div class="batch-summary-grid">
        <div class="batch-stat"><span class="batch-stat-label">Date Received</span><span class="batch-stat-val">${fmtDate(b.date_received)}</span></div>
        <div class="batch-stat"><span class="batch-stat-label">Units in Batch</span><span class="batch-stat-val">${b.unit_count}</span></div>
        <div class="batch-stat"><span class="batch-stat-label">Total Unit Cost</span><span class="batch-stat-val">${fmtMoney(b.total_unit_cost)}</span></div>
        <div class="batch-stat"><span class="batch-stat-label">Shipping Fee</span><span class="batch-stat-val">${fmtMoney(b.shipping_fee)}</span></div>
        <div class="batch-stat"><span class="batch-stat-label">Other Expenses</span><span class="batch-stat-val">${fmtMoney(b.other_expenses)}</span></div>
        <div class="batch-stat accent"><span class="batch-stat-label">Total Landed Cost</span><span class="batch-stat-val">${fmtMoney(b.total_landed_cost)}</span></div>
      </div>
      ${b.notes ? `<p class="form-hint" style="margin-bottom:.9rem">${escHtml(b.notes)}</p>` : ''}
      <p class="batch-units-header">Units in this batch \u2014 oldest first (FIFO order)</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Serial #</th><th>Product</th><th>Cost Price</th><th>Status</th><th>Date Added</th></tr></thead>
        <tbody>${itemRows}</tbody></table></div>`,
    null);
  } catch (err) { toast('Failed to load batch details: ' + err.message, 'error'); }
}

async function deleteBatch(id) {
  const b = allBatches.find(x => x.id === id);
  if (!confirm(`Delete batch "${b?.label ?? id}"? This cannot be undone.`)) return;
  try {
    await API.delete(`/stock-batches/${id}`);
    toast('Batch deleted', 'success'); allBatches = []; loadStockBatches();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS  (admin-only — login history)
// ═══════════════════════════════════════════════════════════════════════════
async function loadActivityLogs() {
  getEl('activity-logs-table').innerHTML = '<div class="loading">Loading logs</div>';
  try {
    const logs = await API.get('/login-logs/');

    // Populate user filter dropdown (once)
    const userSel = getEl('filter-log-user');
    if (userSel && userSel.options.length <= 1) {
      const seen = new Map();
      logs.forEach(l => {
        if (l.user_id && !seen.has(l.user_id)) {
          seen.set(l.user_id, l.user?.name ?? l.username_attempted);
        }
      });
      seen.forEach((name, uid) => {
        const opt = document.createElement('option');
        opt.value = uid; opt.textContent = name;
        userSel.appendChild(opt);
      });
    }

    // Apply filters
    const filterUser   = val('filter-log-user');
    const filterStatus = val('filter-log-status');
    const filtered = logs.filter(l => {
      if (filterUser   && String(l.user_id) !== filterUser) return false;
      if (filterStatus === 'success' && !l.success)  return false;
      if (filterStatus === 'failed'  &&  l.success)  return false;
      return true;
    });

    const rows = filtered.map(l => {
      const statusBadge = l.success
        ? `<span class="badge badge-available">Success</span>`
        : `<span class="badge badge-faulty">Failed</span>`;
      const who = l.user?.name
        ? `<strong>${escHtml(l.user.name)}</strong> <span class="text-muted text-xs">(${escHtml(l.user.role)})</span>`
        : `<span class="text-muted">${escHtml(l.username_attempted)}</span>`;
      const ts = new Date(l.timestamp).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      return `<tr>
        <td class="font-mono text-xs text-muted">#${l.id}</td>
        <td class="text-sm">${who}</td>
        <td class="font-mono text-sm">${escHtml(l.username_attempted)}</td>
        <td>${statusBadge}</td>
        <td class="text-muted text-sm font-mono">${l.ip_address ?? '\u2014'}</td>
        <td class="text-muted text-sm">${ts}</td>
      </tr>`;
    }).join('') || emptyRow(6, 'No login activity recorded yet.');

    getEl('activity-logs-table').innerHTML = `<table>
      <thead><tr>
        <th>#</th><th>User</th><th>Username Entered</th>
        <th>Status</th><th>IP Address</th><th>Timestamp</th>
      </tr></thead>
      <tbody>${rows}</tbody></table>`;

    // Re-run on filter change (attach only once)
    ['filter-log-user','filter-log-status'].forEach(id => {
      const el = getEl(id);
      if (el && !el.dataset.bound) {
        el.dataset.bound = '1';
        el.addEventListener('change', loadActivityLogs);
      }
    });
  } catch (err) { toast('Failed to load activity logs: ' + err.message, 'error'); }
}
