from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect as sa_inspect, select, text

import app.models  # noqa: F401 — ensures all models are registered with Base.metadata
from app.database import Base, SessionLocal, engine
from app.models.business import Business
from app.models.expense import Expense
from app.models.sale import Sale
from app.models.user import User
from app.routers import auth, businesses, expenses, inventory, inventory_requests, login_logs, products, sales, stock_batches, users

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# Businesses seeded on first run. Slugs drive the frontend logo/theme.
DEFAULT_BUSINESSES = [
    {"slug": "okemzhub",    "name": "OKEMZ HUB",    "tagline": "Premium Laptops, Accessible Prices"},
    {"slug": "technext360", "name": "TechNext360",  "tagline": "Smart Choices, Smarter Experience"},
]


def _migrate_existing_tables() -> None:
    """Add missing columns to tables that already exist (no data loss).
    Run after create_all so new tables are created first."""
    inspector = sa_inspect(engine)
    existing_tables = set(inspector.get_table_names())

    pending: dict[str, list[tuple[str, str]]] = {
        "inventory_items": [
            ("stock_batch_id",  "INTEGER REFERENCES stock_batches(id)"),
            ("cost_price",      "NUMERIC(14,2)"),
            ("selling_price",   "NUMERIC(14,2)"),
            ("business_id",     "INTEGER REFERENCES businesses(id)"),
        ],
        "users": [
            ("business_id", "INTEGER REFERENCES businesses(id)"),
        ],
        "sales": [
            ("business_id", "INTEGER REFERENCES businesses(id)"),
        ],
        "expenses": [
            ("business_id", "INTEGER REFERENCES businesses(id)"),
        ],
        "stock_batches": [
            ("expected_unit_count", "INTEGER DEFAULT 0"),
        ],
        "inventory_requests": [
            ("stock_batch_id", "INTEGER REFERENCES stock_batches(id)"),
        ],
    }

    with engine.connect() as conn:
        for table, columns in pending.items():
            if table not in existing_tables:
                continue
            current_cols = {c["name"] for c in inspector.get_columns(table)}
            for col_name, col_def in columns:
                if col_name not in current_cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
        conn.commit()


def _seed_and_backfill_businesses() -> None:
    """Ensure the default businesses exist, then attach any legacy rows that
    predate multi-business support to the primary (Okemzhub) business."""
    with SessionLocal() as db:
        for data in DEFAULT_BUSINESSES:
            exists = db.execute(
                select(Business).where(Business.slug == data["slug"])
            ).scalar_one_or_none()
            if not exists:
                db.add(Business(**data))
        db.commit()

        primary = db.execute(
            select(Business).where(Business.slug == "okemzhub")
        ).scalar_one()

        # Legacy users without a business default to the primary business.
        for user in db.execute(select(User).where(User.business_id.is_(None))).scalars():
            user.business_id = primary.id
        db.commit()

        # Sales / expenses inherit the business of the user who created them.
        for sale in db.execute(select(Sale).where(Sale.business_id.is_(None))).scalars():
            submitter = db.get(User, sale.sold_by_user_id)
            sale.business_id = submitter.business_id if submitter else primary.id
        for expense in db.execute(select(Expense).where(Expense.business_id.is_(None))).scalars():
            submitter = db.get(User, expense.submitted_by_user_id)
            expense.business_id = submitter.business_id if submitter else primary.id
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_existing_tables()
    _seed_and_backfill_businesses()
    yield


app = FastAPI(
    title="Okemzhub Inventory API",
    description="Inventory and business management for a laptop & electronics retail business.",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(businesses.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(inventory_requests.router)
app.include_router(stock_batches.router)
app.include_router(sales.router)
app.include_router(expenses.router)
app.include_router(login_logs.router)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")


@app.get("/", include_in_schema=False)
async def serve_frontend():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "Okemzhub Inventory API"}
