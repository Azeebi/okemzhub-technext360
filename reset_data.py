"""
Clear all operational data while keeping admin login credentials.

Deletes: sales, expenses, inventory requests, inventory items, stock batches,
products, login logs, and all non-admin (staff) users.
Keeps: admin users and the businesses.

Usage: python reset_data.py
"""
import sys

from sqlalchemy import delete, func, select

from app.database import SessionLocal
from app.models import (
    User, UserRole,
    Product,
    InventoryItem,
    InventoryRequest,
    Sale,
    Expense,
    StockBatch,
    LoginLog,
)

db = SessionLocal()

admins = db.execute(
    select(User).where(User.role == UserRole.admin)
).scalars().all()
if not admins:
    print("✗  No admin accounts found. Aborting so you don't lock out.")
    print("   Run `python create_admin.py` first, then re-run this script.")
    db.close()
    sys.exit(1)

print("─" * 48)
print("  Reset Data — keep admin credentials only")
print("─" * 48)
print(f"  Admin accounts to KEEP: {', '.join(a.username for a in admins)}")
print("  This will DELETE all sales, expenses, inventory,")
print("  stock batches, products, login logs and staff users.")
confirm = input("  Type 'RESET' to continue: ").strip()

if confirm != "RESET":
    print("✗  Cancelled. No changes made.")
    db.close()
    sys.exit(0)

# Deleted in FK-safe order: children before parents.
db.execute(delete(LoginLog))
db.execute(delete(Sale))
db.execute(delete(Expense))
db.execute(delete(InventoryRequest))
db.execute(delete(InventoryItem))
db.execute(delete(StockBatch))
db.execute(delete(Product))
db.execute(delete(User).where(User.role != UserRole.admin))
db.commit()

remaining_users = db.execute(
    select(func.count()).select_from(User)
).scalar_one()
print(f"✓  Data cleared. {remaining_users} admin account(s) preserved.")
db.close()
