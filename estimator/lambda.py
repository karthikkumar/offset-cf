import json
import os
import datetime

RATE = float(os.getenv("RATE", "0.02"))
DEFAULT_CURRENCY = os.getenv("DEFAULT_CURRENCY", "USD")
VERSION = os.getenv("ESTIMATOR_VERSION", "v0.1.0")


def _resp(status, body, origin="*"):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method")
    origin = (event.get("headers") or {}).get("origin") or "*"

    # Preflight
    if method == "OPTIONS":
        return _resp(204, {}, origin)

    try:
        body = json.loads(event.get("body") or "{}")
        currency = (body.get("currency") or DEFAULT_CURRENCY)[:3]
        subtotal = float(body.get("subtotal") or 0.0)
        if subtotal < 0:
            return _resp(400, {"error": "subtotal_must_be_non_negative"}, origin)

        est = round(subtotal * RATE, 3)
        now = datetime.datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
        return _resp(200, {
            "estimated_offset": est,
            "rate": RATE,
            "currency": currency,
            "estimator_version": VERSION,
            "updated_at": now
        }, origin)
    except Exception as e:
        print("ERROR:", e, "EVENT:", event)
        return _resp(500, {"error": "internal_error"}, origin)
