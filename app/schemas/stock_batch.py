from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.inventory import InventoryItemRead


class StockBatchBase(BaseModel):
    label: str
    date_received: date
    # Unit count declared by the boss on receiving the stock, e.g. 25.
    # Staff registrations are tracked against this so the boss can see
    # how many units are still remaining (or over/under) at a glance.
    expected_unit_count: int = Field(ge=0)
    shipping_fee: Decimal = Decimal("0")
    other_expenses: Decimal = Decimal("0")
    notes: Optional[str] = None


class StockBatchCreate(StockBatchBase):
    pass


class StockBatchUpdate(BaseModel):
    label: Optional[str] = None
    date_received: Optional[date] = None
    expected_unit_count: Optional[int] = Field(default=None, ge=0)
    shipping_fee: Optional[Decimal] = None
    other_expenses: Optional[Decimal] = None
    notes: Optional[str] = None


class StockBatchRead(StockBatchBase):
    id: int
    unit_count: int = 0
    # Requests submitted against this batch still awaiting admin review
    pending_count: int = 0
    # How many more units are expected but not yet registered (0 if met/over)
    remaining_count: int = 0
    # True once every pending request is resolved but the registered count
    # still doesn't match expected_unit_count — informational, lets the boss
    # know to recheck the count. Does not block units from being Available.
    needs_recheck: bool = False
    total_unit_cost: Decimal = Decimal("0")
    total_landed_cost: Decimal = Decimal("0")


class StockBatchDetail(StockBatchRead):
    items: List[InventoryItemRead] = []
