from pydantic import BaseModel
import os

class Settings(BaseModel):
    """
    Configuración del sistema SFAS según arquitectura C4.
    
    Bases de datos separadas por dominio (Defense in Depth):
    - BD Identidades: usuarios, sesiones, credenciales
    - BD Secretaría: casos, expedientes administrativos
    - BD Jueces: resoluciones, firmas, aperturas M-de-N
    - BD Auditoría: logs, eventos de seguridad, trazabilidad
    """
    
    # ══════════════════════════════════════════════════════════════════════════════
    # URLs de Bases de Datos Separadas (según diagrama C4)
    # ══════════════════════════════════════════════════════════════════════════════
    
    # BD Identidades y Acceso: usuarios, sesiones, credenciales, roles
    database_url_identidad: str = os.getenv(
        "DATABASE_URL_IDENTIDAD",
        "postgresql+psycopg://sfas:sfas_identidad_pass_2026@localhost:5432/sfas_identidad"
    )
    
    # BD Secretaría: casos, expedientes administrativos
    database_url_secretaria: str = os.getenv(
        "DATABASE_URL_SECRETARIA",
        "postgresql+psycopg://sfas:sfas_secretaria_pass_2026@localhost:5432/sfas_secretaria"
    )
    
    # BD Jueces: resoluciones, estados de firma, aperturas M-de-N
    database_url_jueces: str = os.getenv(
        "DATABASE_URL_JUECES",
        "postgresql+psycopg://sfas:sfas_jueces_pass_2026@localhost:5432/sfas_jueces"
    )
    
    # BD Logs y Auditoría: eventos de seguridad, trazabilidad
    database_url_auditoria: str = os.getenv(
        "DATABASE_URL_AUDITORIA",
        "postgresql+psycopg://sfas:sfas_auditoria_pass_2026@localhost:5432/sfas_auditoria"
    )
    
    # ══════════════════════════════════════════════════════════════════════════════
    # Seguridad y Criptografía
    # ══════════════════════════════════════════════════════════════════════════════
    app_master_key: str = os.getenv("APP_MASTER_KEY", "CHANGE_ME")
    
    # ══════════════════════════════════════════════════════════════════════════════
    # Configuración de Cookies (Sesiones)
    # ══════════════════════════════════════════════════════════════════════════════
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    cookie_domain: str | None = os.getenv("COOKIE_DOMAIN") or None
    cookie_name: str = "sfas_session"
    csrf_cookie_name: str = "sfas_csrf"

settings = Settings()
