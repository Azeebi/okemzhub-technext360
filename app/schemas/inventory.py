from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.inventory import ItemStatus


class InventoryItemBase(BaseModel):
    product_id: int
    serial_number: str
    status: ItemStatus = ItemStatus.available
    fault_description: Optional[str] = None
    cost_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    stock_batch_id: Optional[int] = None
    business_id: Optional[int] = None

    @model_validator(mode="after")
    def fault_description_required_when_faulty(self) -> "InventoryItemBase":
        if self.status == ItemStatus.faulty and not self.fault_description:
            raise ValueError("fault_description is required when status is 'faulty'")
        return self


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    status: Optional[ItemStatus] = None
    fault_description: Optional[str] = None
    cost_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    stock_batch_id: Optional[int] = None
    business_id: Optional[int] = None

    @model_validator(mode="after")
    def fault_description_required_when_faulty(self) -> "InventoryItemUpdate":
        if self.status == ItemStatus.faulty and not self.fault_description:
            raise ValueError("fault_description is required when status is 'faulty'")
        return self


class InventoryItemRead(InventoryItemBase):
    id: int
    date_added: datetime
    business_name: Optional[str] = None
    # Shared visibility: who sold this unit (name only, never the price)
    sold_by_name: Optional[str] = None
    sold_by_business: Optional[str] = None
    date_sold: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
