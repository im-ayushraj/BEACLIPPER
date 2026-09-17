"""Database persistence layer: PostgreSQL (Supabase) with SQLite fallback."""
from __future__ import annotations

import os
import uuid
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from sqlalchemy import (
    create_engine,
    Column,
    String,
    Float,
    Integer,
    BigInteger,
    Boolean,
    DateTime,
    Text,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

Base = declarative_base()


def get_utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(128), primary_key=True)  # Clerk sub or local user ID
    email = Column(String(255), nullable=True)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)


class CreditAccount(Base):
    __tablename__ = "credit_accounts"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(128), unique=True, nullable=False, index=True)
    balance = Column(Float, default=100.0, nullable=False)  # 100 starter credits
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(128), nullable=False, index=True)
    type = Column(String(32), nullable=False)  # CREDIT, DEBIT, REFUND, ADJUSTMENT
    amount = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    source = Column(String(64), nullable=False)  # PLAN_ALLOCATION, CREDIT_PURCHASE, AI_CLIPPER, TRANSCRIPTION, REFUND, ADMIN_ADJUSTMENT
    reference_id = Column(String(128), nullable=True, index=True)  # job_id or payment_id
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now, index=True)


class CreditRule(Base):
    __tablename__ = "credit_rules"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    operation = Column(String(64), unique=True, nullable=False)  # AI_CLIPPER, TRANSCRIPTION
    unit = Column(String(32), default="minute")
    credits_per_unit = Column(Float, nullable=False)
    minimum_charge = Column(Float, default=1.0)
    maximum_charge = Column(Float, nullable=True)
    active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)


class ProcessingJobModel(Base):
    __tablename__ = "processing_jobs"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(128), unique=True, nullable=False, index=True)
    user_id = Column(String(128), nullable=False, index=True)
    job_type = Column(String(32), nullable=False, default="ai_clipper")  # ai_clipper, transcription, video_splitter
    url = Column(Text, nullable=True)
    status = Column(String(32), default="processing", index=True)
    stage = Column(String(64), default="video")
    progress_percent = Column(Integer, default=5)
    duration_seconds = Column(Float, nullable=True)
    credits_deducted = Column(Float, default=0.0)
    error = Column(Text, nullable=True)
    idempotency_key = Column(String(128), nullable=True, index=True)
    created_at = Column(DateTime, default=get_utc_now, index=True)
    completed_at = Column(DateTime, nullable=True)


class ClipModel(Base):
    __tablename__ = "clips_records"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(128), nullable=False, index=True)
    user_id = Column(String(128), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    title = Column(String(512), nullable=False)
    duration = Column(Float, nullable=False)
    score = Column(Float, default=8.0)
    tags_json = Column(Text, default="[]")
    explanation = Column(Text, nullable=True)
    reason = Column(Text, nullable=True)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    storage_path = Column(Text, nullable=True)
    signed_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now, index=True)


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(128), nullable=False, index=True)
    job_id = Column(String(128), nullable=True, index=True)
    operation = Column(String(64), nullable=False)  # ai_clipper, transcription, video_splitter
    duration_seconds = Column(Float, default=0.0)
    processing_seconds = Column(Float, default=0.0)
    llm_calls = Column(Integer, default=0)
    llm_tokens = Column(Integer, default=0)
    clip_count = Column(Integer, default=0)
    storage_bytes = Column(BigInteger, default=0)
    created_at = Column(DateTime, default=get_utc_now, index=True)


class PlanDefinition(Base):
    __tablename__ = "plan_definitions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(64), unique=True, nullable=False)  # free, creator, pro, enterprise
    monthly_credits = Column(Float, default=100.0)
    max_video_duration_minutes = Column(Integer, default=35)
    max_upload_size_mb = Column(Integer, default=500)
    price_cents = Column(Integer, default=0)
    currency = Column(String(8), default="USD")
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_utc_now)


class SubscriptionModel(Base):
    __tablename__ = "subscriptions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(128), nullable=False, index=True)
    plan_id = Column(String(64), nullable=False)
    status = Column(String(32), default="active")  # active, canceled, past_due
    current_period_start = Column(DateTime, default=get_utc_now)
    current_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)


class CreditPackage(Base):
    __tablename__ = "credit_packages"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(128), nullable=False)  # 100 Credits, 500 Credits, etc.
    credits = Column(Float, nullable=False)
    price_cents = Column(Integer, nullable=False)
    currency = Column(String(8), default="USD")
    active = Column(Boolean, default=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)


# Engine & Session Management
_engine = None
_SessionLocal = None


def get_database_url() -> str:
    """Determine database connection URL with PostgreSQL or SQLite fallback."""
    db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if db_url:
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        return db_url
    
    # SQLite local development and testing fallback
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sqlite_path = os.path.join(base_dir, "ai_clipper.db")
    return f"sqlite:///{sqlite_path}"


def init_db():
    global _engine, _SessionLocal
    if _engine is not None:
        return _engine

    db_url = get_database_url()
    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    _engine = create_engine(
        db_url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

    # Create tables
    Base.metadata.create_all(bind=_engine)

    # Seed default credit rules & plans
    seed_defaults()
    return _engine


def get_db_session() -> Session:
    global _SessionLocal
    if _SessionLocal is None:
        init_db()
    return _SessionLocal()


def seed_defaults():
    """Seed default credit rules, plan definitions, and credit packages if not present."""
    session = get_db_session()
    try:
        # 1. Default Credit Rules
        rules = [
            {"operation": "AI_CLIPPER", "credits_per_unit": 2.0, "unit": "minute", "minimum_charge": 5.0},
            {"operation": "TRANSCRIPTION", "credits_per_unit": 1.0, "unit": "minute", "minimum_charge": 2.0},
        ]
        for r in rules:
            existing = session.query(CreditRule).filter_by(operation=r["operation"]).first()
            if not existing:
                rule = CreditRule(
                    operation=r["operation"],
                    credits_per_unit=r["credits_per_unit"],
                    unit=r["unit"],
                    minimum_charge=r["minimum_charge"],
                    active=True,
                )
                session.add(rule)

        # 2. Default Plans
        plans = [
            {"name": "free", "monthly_credits": 100.0, "max_video_duration_minutes": 35, "price_cents": 0},
            {"name": "creator", "monthly_credits": 600.0, "max_video_duration_minutes": 60, "price_cents": 1900},
            {"name": "pro", "monthly_credits": 2000.0, "max_video_duration_minutes": 120, "price_cents": 4900},
        ]
        for p in plans:
            existing = session.query(PlanDefinition).filter_by(name=p["name"]).first()
            if not existing:
                plan = PlanDefinition(
                    name=p["name"],
                    monthly_credits=p["monthly_credits"],
                    max_video_duration_minutes=p["max_video_duration_minutes"],
                    price_cents=p["price_cents"],
                    currency="USD",
                    active=True,
                )
                session.add(plan)

        # 3. Default Credit Top-Up Packages
        packages = [
            {"name": "Starter Boost", "credits": 100.0, "price_cents": 500},
            {"name": "Growth Pack", "credits": 500.0, "price_cents": 2000},
            {"name": "Pro Pack", "credits": 1500.0, "price_cents": 5000},
        ]
        for pkg in packages:
            existing = session.query(CreditPackage).filter_by(name=pkg["name"]).first()
            if not existing:
                cp = CreditPackage(
                    name=pkg["name"],
                    credits=pkg["credits"],
                    price_cents=pkg["price_cents"],
                    currency="USD",
                    active=True,
                )
                session.add(cp)

        session.commit()
    except Exception as e:
        session.rollback()
        print(f"[DB] Warning during seeding: {e}")
    finally:
        session.close()
