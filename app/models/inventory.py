import enum
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.product import Product
    from app.models.sale import Sale
    from app.models.stock_batch import StockBatch


class ItemStatus(str, enum.Enum):
    available = "available"
    sold = "sold"
    faulty = "faulty"


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    serial_number: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    status: Mapped[ItemStatus] = mapped_column(
        SAEnum(ItemStatus, name="itemstatus"), default=ItemStatus.available
    )
    fault_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date_added: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    # Cost tracking (admin-only)
    stock_batch_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stock_batches.id"), nullable=True, index=True
    )
    cost_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    # Suggested resale price set by the boss on approval. Visible to staff —
    # distinct from cost_price (admin-only) and from the final price typed
    # in at the point of sale, which may differ after negotiation.
    selling_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    # Which business this unit belongs to (shared pool, labelled per store)
    business_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("businesses.id"), nullable=True, index=True
    )

    product: Mapped["Product"] = relationship("Product", back_populates="inventory_items")
    business: Mapped[Optional["Business"]] = relationship("Business")
    sale: Mapped[Optional["Sale"]] = relationship(
        "Sale", back_populates="inventory_item", uselist=False
    )
    stock_batch: Mapped[Optional["StockBatch"]] = relationship(
        "StockBatch", back_populates="items"
    )

    # Shared-view helpers: reveal WHO sold a unit (name only, no price) so both
    # sisters can see who picked a unit that is no longer available.
    @property
    def sold_by_name(self) -> Optional[str]:
        return self.sale.sold_by.name if self.sale and self.sale.sold_by else None

    @property
    def sold_by_business(self) -> Optional[str]:
        return self.sale.business.name if self.sale and self.sale.business else None

    @property
    def date_sold(self) -> Optional[datetime]:
        return self.sale.date_sold if self.sale else None

    @property
    def business_name(self) -> Optional[str]:
        return self.business.name if self.business else None
