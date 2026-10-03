from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, require_admin
from app.models.inventory import InventoryItem, ItemStatus
from app.models.sale import Sale
from app.schemas.inventory import InventoryItemCreate, InventoryItemRead, InventoryItemUpdate

router = APIRouter(prefix="/inventory", tags=["Inventory"])

# Eager-load the sale + seller + business so the shared "who sold it" fields
# resolve in one query instead of N+1 lazy loads.
_load_seller = [
    selectinload(InventoryItem.business),
    selectinload(InventoryItem.sale).selectinload(Sale.sold_by),
    selectinload(InventoryItem.sale).selectinload(Sale.business),
]


@router.get("/", response_model=list[InventoryItemRead])
async def list_inventory(
    product_id: Optional[int] = None,
    item_status: Optional[ItemStatus] = None,
    business_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """List inventory units. Optionally filter by product, status or business."""
    query = select(InventoryItem).options(*_load_seller)
    if product_id is not None:
        query = query.where(InventoryItem.product_id == product_id)
    if item_status is not None:
        query = query.where(InventoryItem.status == item_status)
    if business_id is not None:
        query = query.where(InventoryItem.business_id == business_id)
    return db.execute(query).scalars().all()


@router.post("/", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
async def add_inventory_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Add a new individual unit to stock. Serial number must be unique."""
    if db.execute(
        select(InventoryItem).where(InventoryItem.serial_number == payload.serial_number)
    ).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A unit with this serial number already exists",
        )
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=InventoryItemRead)
async def get_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Get a single inventory unit by ID."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )
    return item


@router.patch("/{item_id}", response_model=InventoryItemRead)
async def update_inventory_item(
    item_id: int,
    payload: InventoryItemUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Update a unit's status (e.g. mark as Faulty with a description)."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_inventory_item(item_id: int, db: Session = Depends(get_db)):
    """[Admin] Permanently remove an inventory record."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )
    db.delete(item)
    db.commit()
