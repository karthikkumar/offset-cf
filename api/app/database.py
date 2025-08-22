import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Get DB_URL with fallback for development
DB_URL = os.environ.get("DB_URL", "postgresql://localhost:5432/offsetcf")

engine = create_engine(DB_URL, pool_size=5, max_overflow=5, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
