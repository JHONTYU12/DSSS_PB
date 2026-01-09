"""
Inicialización de las 4 bases de datos según arquitectura C4.

Este módulo:
1. Crea las tablas en cada base de datos correspondiente
2. Siembra usuarios de demostración con TOTP configurado
"""

from .session import (
    engine_identidad, engine_secretaria, engine_jueces, engine_auditoria,
    SessionIdentidad
)
from .base import BaseIdentidad, BaseSecretaria, BaseJueces, BaseAuditoria
from . import models
from passlib.hash import bcrypt
import pyotp
import uuid
from datetime import datetime, timezone, timedelta
from ..core.settings import settings

DEMO_USERS = [
    ("admin", "admin", "Admin!2026_SFAS"),
    ("juez1", "juez", "Juez!2026_SFAS"),
    ("secret1", "secretario", "Secret!2026_SFAS"),
    ("cust1", "custodio", "Cust!2026_SFAS"),
    ("cust2", "custodio", "Cust!2026_SFAS"),
    ("audit1", "auditor", "Audit!2026_SFAS"),
]


def init_db_and_seed():
    """
    Inicializa las 4 bases de datos y siembra datos de demostración.
    
    Bases de datos (según diagrama C4):
    - BD Identidades: users, sessions
    - BD Secretaría: cases
    - BD Jueces: resolutions, opening_requests, opening_approvals
    - BD Auditoría: audit_events
    """
    print("[SFAS] ══════════════════════════════════════════════════════════")
    print("[SFAS] Inicializando bases de datos según arquitectura C4...")
    print("[SFAS] ══════════════════════════════════════════════════════════")
    
    # Crear tablas en BD Identidades y Acceso
    print("[SFAS] → Creando tablas en BD Identidades y Acceso...")
    BaseIdentidad.metadata.create_all(bind=engine_identidad)
    print("[SFAS]   ✓ Tablas: users, sessions")
    
    # Crear tablas en BD Secretaría
    print("[SFAS] → Creando tablas en BD Secretaría...")
    BaseSecretaria.metadata.create_all(bind=engine_secretaria)
    print("[SFAS]   ✓ Tablas: cases")
    
    # Crear tablas en BD Jueces
    print("[SFAS] → Creando tablas en BD Jueces...")
    BaseJueces.metadata.create_all(bind=engine_jueces)
    print("[SFAS]   ✓ Tablas: resolutions, opening_requests, opening_approvals")
    
    # Crear tablas en BD Auditoría
    print("[SFAS] → Creando tablas en BD Logs y Auditoría...")
    BaseAuditoria.metadata.create_all(bind=engine_auditoria)
    print("[SFAS]   ✓ Tablas: audit_events")
    
    print("[SFAS] ══════════════════════════════════════════════════════════")
    print("[SFAS] Todas las tablas creadas exitosamente")
    print("[SFAS] ══════════════════════════════════════════════════════════")
    
    # Sembrar usuarios de demostración en BD Identidades
    db = SessionIdentidad()
    try:
        if db.query(models.User).count() == 0:
            print("[SFAS]")
            print("[SFAS] Sembrando usuarios de demostración (password + TOTP)...")
            print("[SFAS] ──────────────────────────────────────────────────────────")
            
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
                
                uri = pyotp.TOTP(secret).provisioning_uri(
                    name=username, 
                    issuer_name="LexSecure-SFAS"
                )
                print(f"[SFAS] Usuario: {username}")
                print(f"[SFAS]   Rol: {role}")
                print(f"[SFAS]   Password: {password}")
                print(f"[SFAS]   TOTP URI: {uri}")
                print("[SFAS]")
            
            db.commit()
            print("[SFAS] ══════════════════════════════════════════════════════════")
            print("[SFAS] ✓ Usuarios creados exitosamente")
            print("[SFAS] ══════════════════════════════════════════════════════════")
        else:
            print("[SFAS] Usuarios ya existen, omitiendo seed...")
    finally:
        db.close()
