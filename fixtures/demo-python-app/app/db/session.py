"""DB session factory — external sqlalchemy leaf."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.lib.logger import info

_engine = create_engine("sqlite:///:memory:")
SessionLocal = sessionmaker(bind=_engine)


def get_session():
    info("db session opened")
    return SessionLocal()
