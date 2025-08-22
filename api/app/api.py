from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional
from pydantic import ValidationError

from models import OptInReq
from database import SessionLocal
from constants import DEFAULT_CONFIG
from utils import month_bounds

import json

router = APIRouter()


@router.get("/widget-config")
def get_widget_config(store: str | None = None, merchant_id: int | None = None):
    """Get widget configuration by store domain or merchant ID"""
    if not store and merchant_id is None:
        raise HTTPException(400, "provide either store or merchant_id")

    with SessionLocal() as s:
        if merchant_id is not None:
            row = s.execute(text(
                """
                SELECT placement, verbiage, theme_json, insert_position, is_enabled
                FROM widget_configs
                WHERE merchant_id = :mid
                ORDER BY updated_at DESC
                LIMIT 1
                """
            ), {"mid": merchant_id}).mappings().first()
        else:
            row = s.execute(text(
                """
                SELECT wc.placement, wc.verbiage, wc.theme_json, wc.insert_position, wc.is_enabled
                FROM widget_configs wc
                JOIN merchants m ON m.id = wc.merchant_id
                WHERE m.store_domain = :store
                ORDER BY wc.updated_at DESC
                LIMIT 1
                """
            ), {"store": store}).mappings().first()

    if not row:
        # Fallback to a sensible default so the widget can still render
        return DEFAULT_CONFIG

    return {
        "placement": row["placement"],
        "verbiage": row["verbiage"],
        "theme": row["theme_json"] or {},
        "insert_position": row.get("insert_position", "before"),
        "is_enabled": bool(row.get("is_enabled", True)),
    }


@router.get("/merchant/{store}/widget-config")
def get_widget_config_for_store(store: str):
    """Get widget configuration for a specific store"""
    return get_widget_config(store=store)


@router.post("/opt-ins")
async def create_optin(request: Request):
    """Log an opt-in event (accepts application/json or text/plain beacons)."""
    raw = await request.body()
    if not raw:
        raise HTTPException(400, "empty body")

    # Parse body regardless of content-type; widget sends JSON as text/plain to avoid preflight
    try:
        data = json.loads(raw.decode('utf-8')
                          if isinstance(raw, (bytes, bytearray)) else raw)
    except Exception as e:
        raise HTTPException(400, f"invalid JSON: {e}")

    try:
        req = OptInReq(**data)
    except ValidationError as e:
        # Let the client know the payload was structurally wrong
        raise HTTPException(422, e.errors())

    with SessionLocal() as s:
        m = s.execute(text("SELECT id FROM merchants WHERE store_domain=:store"),
                      {"store": req.store}).first()
        if not m:
            raise HTTPException(400, "unknown store")

        s.execute(text("""
          INSERT INTO opt_ins (
            merchant_id, customer_id, customer_email, session_id, order_ref,
            cart_subtotal, currency, estimated_offset, estimator_version
          )
          VALUES (
            :mid, :cid, :email, :sid, :oref,
            :subtotal, :currency, :est, :eversion
          )
        """), {
            "mid": m.id,
            "cid": (req.customer or {}).get("id"),
            "email": (req.customer or {}).get("email"),
            "sid": req.session_id,
            "oref": req.order_ref,
            "subtotal": round(req.cart.subtotal, 2),
            "currency": req.cart.currency or "USD",
            "est": round(req.estimated_offset, 3),
            "eversion": req.estimator_version,
        })
        s.commit()
        print(
            f"opt-in recorded: {req.store} {req.cart.subtotal} {req.estimated_offset}")
    return {"status": "recorded"}


@router.get("/merchant/{store}/monthly-summary")
def monthly_summary(store: str, month: Optional[str] = None):
    """Get monthly summary for a store"""
    start, end = month_bounds(month)
    with SessionLocal() as s:
        merchant = s.execute(
            text("SELECT id, currency FROM merchants WHERE store_domain=:store"),
            {"store": store},
        ).mappings().first()
        if not merchant:
            raise HTTPException(404, "unknown store")

        total = s.execute(text("""
            SELECT
              COUNT(*)::int AS opt_ins,
              COALESCE(SUM(estimated_offset), 0)::numeric AS estimated_total
            FROM opt_ins
            WHERE merchant_id=:mid
              AND updated_at >= :start
              AND updated_at < :end
        """), {"mid": merchant["id"], "start": start, "end": end}).mappings().first()

        daily = s.execute(text("""
            SELECT
              date_trunc('day', updated_at) AS day,
              COUNT(*)::int AS opt_ins,
              COALESCE(SUM(estimated_offset), 0)::numeric AS estimated_total
            FROM opt_ins
            WHERE merchant_id=:mid
              AND updated_at >= :start
              AND updated_at < :end
            GROUP BY 1
            ORDER BY 1
        """), {"mid": merchant["id"], "start": start, "end": end}).mappings().all()

        return {
            "store": store,
            "month": (month or start.strftime("%Y-%m")),
            "currency": merchant["currency"],
            "totals": {
                "opt_ins": total["opt_ins"],
                "estimated_offset": float(total["estimated_total"]),
            },
            "daily": [
                {"day": r["day"].date().isoformat(),
                 "opt_ins": r["opt_ins"],
                 "estimated_offset": float(r["estimated_total"])}
                for r in daily
            ],
        }
