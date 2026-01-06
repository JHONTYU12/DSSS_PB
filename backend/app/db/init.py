from .session import engine, SessionLocal
from .base import Base
from . import models
from passlib.hash import bcrypt
import pyotp
import uuid
from datetime import datetime, timezone, timedelta
from ..core.settings import settings

DEMO_USERS = [
    ("admin","admin","Admin!2026_SFAS"),
    ("juez1","juez","Juez!2026_SFAS"),
    ("secret1","secretario","Secret!2026_SFAS"),
    ("cust1","custodio","Cust!2026_SFAS"),
    ("cust2","custodio","Cust!2026_SFAS"),
    ("audit1","auditor","Audit!2026_SFAS"),
]

def init_db_and_seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Seed only if empty
        if db.query(models.User).count() == 0:
            print("[SFAS] Seeding demo users (password + TOTP).")
            for username, role, password in DEMO_USERS:
                secret = pyotp.random_base32()
                user = models.User(
                    id=str(uuid.uuid4()),
                    username=username,
                    role=role,
                    password_hash=bcrypt.hash(password),
                    totp_secret=secret,
                    is_active=True
                )
                db.add(user)
                db.flush()
                uri = pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name="LexSecure-SFAS")
                print(f"[SFAS] User={username} role={role} password={password}")
                print(f"[SFAS] TOTP URI (scan in authenticator): {uri}")
            db.commit()
    finally:
        db.close()
