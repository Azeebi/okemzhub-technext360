from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.inventory_request import RequestStatus
from app.schemas.product import ProductRead
from app.schemas.user import UserRead


class InventoryRequestCreate(BaseModel):
    product_id: int
    serial_number: str
    fault_description: Optional[str] = None
    # Which boss-declared stock delivery this unit is being registered against
    stock_batch_id: int


class InventoryRequestReview(BaseModel):
    status: RequestStatus
    rejection_reason: Optional[str] = None
    # Passed to the InventoryItem created on approval
    cost_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    stock_batch_id: Optional[int] = None
    business_id: Optional[int] = None

    @model_validator(mode="after")
    def rejection_reason_required(self) -> "InventoryRequestReview":
        if self.status == RequestStatus.rejected and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting a request")
        return self


class InventoryRequestRead(BaseModel):
    id: int
    product_id: int
    serial_number: str
    fault_description: Optional[str] = None
    requested_by_user_id: int
    requested_by: Optional[UserRead] = None
    product: Optional[ProductRead] = None
    stock_batch_id: Optional[int] = None
    status: RequestStatus
    rejection_reason: Optional[str] = None
    date_requested: datetime
    model_config = ConfigDict(from_attributes=True)
