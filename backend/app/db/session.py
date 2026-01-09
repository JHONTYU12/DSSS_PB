"""
Configuración de conexiones a bases de datos según arquitectura C4.

Sistema SFAS utiliza 4 bases de datos separadas (Defense in Depth):
1. BD Identidades y Acceso - usuarios, sesiones, credenciales
2. BD Secretaría - casos, expedientes administrativos
3. BD Jueces - resoluciones, firmas, aperturas M-de-N
4. BD Auditoría - logs, eventos de seguridad, trazabilidad

Cada base de datos tiene su propio engine y SessionLocal para
garantizar aislamiento de datos entre dominios.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from ..core.settings import settings

# ══════════════════════════════════════════════════════════════════════════════
# ENGINE: BD Identidades y Acceso
# Tablas: users, sessions
# ══════════════════════════════════════════════════════════════════════════════
engine_identidad = create_engine(
    settings.database_url_identidad,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)
SessionIdentidad = sessionmaker(bind=engine_identidad, autocommit=False, autoflush=False)

# ══════════════════════════════════════════════════════════════════════════════
# ENGINE: BD Secretaría
# Tablas: cases
# ══════════════════════════════════════════════════════════════════════════════
engine_secretaria = create_engine(
    settings.database_url_secretaria,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)
SessionSecretaria = sessionmaker(bind=engine_secretaria, autocommit=False, autoflush=False)

# ══════════════════════════════════════════════════════════════════════════════
# ENGINE: BD Jueces
# Tablas: resolutions, opening_requests, opening_approvals
# ══════════════════════════════════════════════════════════════════════════════
engine_jueces = create_engine(
    settings.database_url_jueces,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)
SessionJueces = sessionmaker(bind=engine_jueces, autocommit=False, autoflush=False)

# ══════════════════════════════════════════════════════════════════════════════
# ENGINE: BD Auditoría
# Tablas: audit_events
# ══════════════════════════════════════════════════════════════════════════════
engine_auditoria = create_engine(
    settings.database_url_auditoria,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)
SessionAuditoria = sessionmaker(bind=engine_auditoria, autocommit=False, autoflush=False)

# ══════════════════════════════════════════════════════════════════════════════
# Diccionario de engines para inicialización
# ══════════════════════════════════════════════════════════════════════════════
ALL_ENGINES = {
    "identidad": engine_identidad,
    "secretaria": engine_secretaria,
    "jueces": engine_jueces,
    "auditoria": engine_auditoria,
}

# Alias de compatibilidad (para código legacy)
engine = engine_identidad
SessionLocal = SessionIdentidad
