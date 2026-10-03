from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.business import Business
from app.schemas.business import BusinessRead

router = APIRouter(prefix="/businesses", tags=["Businesses"])


@router.get("/", response_model=list[BusinessRead])
async def list_businesses(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """List the businesses (used to label/filter shared inventory units)."""
    return db.execute(select(Business).order_by(Business.name)).scalars().all()
