from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from api import router

app = FastAPI(title="Offset CF API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/v1")


@app.get("/health")
def health():
    """Simple health check endpoint"""
    try:
        from database import engine
        # lightweight DB ping
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        return {"ok": True, "database": "connected"}
    except Exception as e:
        # Return unhealthy status but don't crash
        return {"ok": False, "database": "disconnected", "error": str(e)}
