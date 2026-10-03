from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, require_admin
from app.models.inventory import InventoryItem, ItemStatus
from app.models.inventory_request import InventoryRequest, RequestStatus
from app.models.user import User, UserRole
from app.schemas.inventory_request import (
    InventoryRequestCreate,
    InventoryRequestRead,
    InventoryRequestReview,
)

router = APIRouter(prefix="/inventory-requests", tags=["Inventory Requests"])

_load_relations = [
    selectinload(InventoryRequest.requested_by),
    selectinload(InventoryRequest.product),
]


@router.get("/", response_model=list[InventoryRequestRead])
async def list_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List requests. Admins see all; staff see only their own."""
    query = (
        select(InventoryRequest)
        .options(*_load_relations)
        .order_by(InventoryRequest.date_requested.desc())
    )
    if current_user.role == UserRole.staff:
        query = query.where(InventoryRequest.requested_by_user_id == current_user.id)
    return db.execute(query).scalars().all()


@router.post("/", response_model=InventoryRequestRead, status_code=status.HTTP_201_CREATED)
async def submit_request(
    payload: InventoryRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a stock request for admin review."""
    req = InventoryRequest(
        product_id=payload.product_id,
        serial_number=payload.serial_number,
        fault_description=payload.fault_description,
        requested_by_user_id=current_user.id,
        stock_batch_id=payload.stock_batch_id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return db.execute(
        select(InventoryRequest).options(*_load_relations).where(InventoryRequest.id == req.id)
    ).scalar_one()


@router.patch("/{request_id}/review", response_model=InventoryRequestRead, dependencies=[Depends(require_admin)])
async def review_request(
    request_id: int,
    payload: InventoryRequestReview,
    db: Session = Depends(get_db),
):
    """[Admin] Approve or reject a pending stock request."""
    req = db.get(InventoryRequest, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != RequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already reviewed")

    if payload.status == RequestStatus.approved:
        if db.execute(
            select(InventoryItem).where(InventoryItem.serial_number == req.serial_number)
        ).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A unit with this serial number already exists in inventory",
            )
        # Approval creates the actual inventory item, straight into Available
        # stock. If no business is chosen, default to the requester's business.
        requester = db.get(User, req.requested_by_user_id)
        business_id = payload.business_id or (requester.business_id if requester else None)
        db.add(InventoryItem(
            product_id=req.product_id,
            serial_number=req.serial_number,
            fault_description=req.fault_description,
            status=ItemStatus.available,
            cost_price=payload.cost_price,
            selling_price=payload.selling_price,
            stock_batch_id=payload.stock_batch_id or req.stock_batch_id,
            business_id=business_id,
        ))
    else:
        req.rejection_reason = payload.rejection_reason

    req.status = payload.status
    db.commit()

    return db.execute(
        select(InventoryRequest).options(*_load_relations).where(InventoryRequest.id == request_id)
    ).scalar_one()


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a pending request. Staff can only delete their own."""
    req = db.get(InventoryRequest, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if current_user.role == UserRole.staff and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    if req.status == RequestStatus.approved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot delete an approved request")
    db.delete(req)
    db.commit()
