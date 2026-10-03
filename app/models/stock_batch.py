from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Date, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.inventory import InventoryItem
    from app.models.inventory_request import InventoryRequest


class StockBatch(Base):
    __tablename__ = "stock_batches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    label: Mapped[str] = mapped_column(String(200))
    date_received: Mapped[date] = mapped_column(Date)
    # Unit count a boss declares on receiving the stock (e.g. "25 units").
    # Staff registrations are tracked against this so the boss can see
    # how many units are still remaining (or over/under) at a glance.
    expected_unit_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    other_expenses: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    items: Mapped[List["InventoryItem"]] = relationship(
        "InventoryItem", back_populates="stock_batch", lazy="select"
    )
    requests: Mapped[List["InventoryRequest"]] = relationship(
        "InventoryRequest", back_populates="stock_batch", lazy="select"
    )
