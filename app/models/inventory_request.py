import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.stock_batch import StockBatch
    from app.models.user import User


class RequestStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"


class InventoryRequest(Base):
    __tablename__ = "inventory_requests"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    serial_number: Mapped[str] = mapped_column(String(100), index=True)
    fault_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # Which boss-declared stock delivery this unit is being registered against
    stock_batch_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stock_batches.id"), nullable=True, index=True
    )
    status: Mapped[RequestStatus] = mapped_column(
        SAEnum(RequestStatus, name="requeststatus"), default=RequestStatus.pending
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date_requested: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    product: Mapped["Product"] = relationship("Product")
    requested_by: Mapped["User"] = relationship("User")
    stock_batch: Mapped[Optional["StockBatch"]] = relationship(
        "StockBatch", back_populates="requests"
    )
