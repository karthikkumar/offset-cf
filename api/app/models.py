from sqlalchemy import JSON, String, Boolean, Integer, ForeignKey
from sqlalchemy.orm import declarative_base, Mapped, mapped_column
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

# SQLAlchemy Base
Base = declarative_base()

# SQLAlchemy Models


class Merchant(Base):
    __tablename__ = 'merchants'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_domain: Mapped[str] = mapped_column(String, unique=True)
    invoice_email: Mapped[str | None] = mapped_column(String, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default='USD')
    created_at: Mapped[datetime] = mapped_column()


class WidgetConfig(Base):
    __tablename__ = 'widget_configs'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    merchant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('merchants.id'))
    placement: Mapped[str] = mapped_column(String)
    verbiage: Mapped[str] = mapped_column(String)
    theme_json: Mapped[dict] = mapped_column(JSON, default={})
    insert_position: Mapped[str] = mapped_column(
        String, default='before')  # 'before' | 'after' | 'append'
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column()


# Pydantic Models
class Cart(BaseModel):
    subtotal: float
    currency: str | None = "USD"


class OptInReq(BaseModel):
    store: str
    cart: Cart
    estimated_offset: float
    estimator_version: str | None = None
    session_id: str | None = None
    customer: dict | None = None
    order_ref: str | None = None
