from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, require_admin
from app.models.inventory_request import InventoryRequest, RequestStatus
from app.models.stock_batch import StockBatch
from app.schemas.inventory import InventoryItemRead
from app.schemas.stock_batch import (
    StockBatchCreate,
    StockBatchDetail,
    StockBatchRead,
    StockBatchUpdate,
)

router = APIRouter(prefix="/stock-batches", tags=["Stock Batches"])

_load_items = [selectinload(StockBatch.items)]


def _pending_counts(db: Session) -> dict[int, int]:
    """batch_id -> number of still-pending requests registered against it."""
    rows = db.execute(
        select(InventoryRequest.stock_batch_id, func.count())
        .where(
            InventoryRequest.status == RequestStatus.pending,
            InventoryRequest.stock_batch_id.is_not(None),
        )
        .group_by(InventoryRequest.stock_batch_id)
    ).all()
    return {batch_id: count for batch_id, count in rows}


def _to_read(batch: StockBatch, pending_count: int = 0) -> StockBatchRead:
    total = sum(i.cost_price or Decimal("0") for i in batch.items)
    unit_count = len(batch.items)
    registered = unit_count + pending_count
    remaining_count = max(batch.expected_unit_count - registered, 0)
    # Only flag once registration has actually started and nothing is left
    # pending — an untouched, freshly-created batch isn't a "problem" yet.
    needs_recheck = (
        unit_count > 0 and pending_count == 0 and unit_count != batch.expected_unit_count
    )
    return StockBatchRead(
        id=batch.id,
        label=batch.label,
        date_received=batch.date_received,
        expected_unit_count=batch.expected_unit_count,
        shipping_fee=batch.shipping_fee,
        other_expenses=batch.other_expenses,
        notes=batch.notes,
        unit_count=unit_count,
        pending_count=pending_count,
        remaining_count=remaining_count,
        needs_recheck=needs_recheck,
        total_unit_cost=total,
        total_landed_cost=total + batch.shipping_fee + batch.other_expenses,
    )


def _to_detail(batch: StockBatch, pending_count: int = 0) -> StockBatchDetail:
    read = _to_read(batch, pending_count)
    sorted_items = sorted(batch.items, key=lambda i: i.date_added)
    return StockBatchDetail(
        **read.model_dump(),
        items=[InventoryItemRead.model_validate(i) for i in sorted_items],
    )


@router.get("/", response_model=list[StockBatchRead])
async def list_batches(db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    """List stock batches (staff need this to pick a batch when registering
    units; admins also see cost summaries here)."""
    batches = db.execute(
        select(StockBatch).options(*_load_items).order_by(StockBatch.date_received.desc())
    ).scalars().all()
    pending = _pending_counts(db)
    return [_to_read(b, pending.get(b.id, 0)) for b in batches]


@router.post(
    "/",
    response_model=StockBatchRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_batch(payload: StockBatchCreate, db: Session = Depends(get_db)):
    """[Admin] Create a new stock batch."""
    batch = StockBatch(**payload.model_dump())
    db.add(batch)
    db.commit()
    db.refresh(batch)
    # No items/requests yet, safe to construct directly
    return StockBatchRead(
        id=batch.id, label=batch.label, date_received=batch.date_received,
        expected_unit_count=batch.expected_unit_count,
        shipping_fee=batch.shipping_fee, other_expenses=batch.other_expenses,
        notes=batch.notes, unit_count=0, pending_count=0,
        remaining_count=batch.expected_unit_count, needs_recheck=False,
        total_unit_cost=Decimal("0"), total_landed_cost=batch.shipping_fee + batch.other_expenses,
    )


@router.get("/{batch_id}", response_model=StockBatchDetail, dependencies=[Depends(require_admin)])
async def get_batch(batch_id: int, db: Session = Depends(get_db)):
    """[Admin] Get a batch with its full list of inventory units (FIFO order)."""
    batch = db.execute(
        select(StockBatch).options(*_load_items).where(StockBatch.id == batch_id)
    ).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock batch not found")
    pending = _pending_counts(db)
    return _to_detail(batch, pending.get(batch.id, 0))


@router.put("/{batch_id}", response_model=StockBatchRead, dependencies=[Depends(require_admin)])
async def update_batch(
    batch_id: int, payload: StockBatchUpdate, db: Session = Depends(get_db)
):
    """[Admin] Update batch details (label, dates, fees)."""
    batch = db.execute(
        select(StockBatch).options(*_load_items).where(StockBatch.id == batch_id)
    ).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock batch not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(batch, field, value)
    db.commit()
    # Reload with items to recompute totals
    batch = db.execute(
        select(StockBatch).options(*_load_items).where(StockBatch.id == batch_id)
    ).scalar_one()
    pending = _pending_counts(db)
    return _to_read(batch, pending.get(batch.id, 0))


@router.delete(
    "/{batch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    """[Admin] Delete a batch. Fails if units are still assigned."""
    batch = db.execute(
        select(StockBatch).options(*_load_items).where(StockBatch.id == batch_id)
    ).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock batch not found")
    if batch.items:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete a batch with {len(batch.items)} assigned unit(s). "
                   "Unassign all units first.",
        )
    db.delete(batch)
    db.commit()
