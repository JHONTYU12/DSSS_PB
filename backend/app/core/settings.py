"""
Configuración del Sistema SFAS - Software Seguro
================================================

ARQUITECTURA DE SEGURIDAD (Defense in Depth):

1. JWT firmado con HS256:
   - Contiene: user_id, username, role, exp, iat, jti
   - Firmado con JWT_SECRET_KEY (256 bits mínimo)
   - Expiración: 8 horas

2. Cookie HttpOnly para JWT:
   - HttpOnly=True → JavaScript NO puede leerla (protección XSS)
   - Secure=True en producción (solo HTTPS)
   - SameSite=Lax (protección CSRF parcial)

3. CSRF Double-Submit Cookie:
   - Cookie sfas_csrf (legible por JS)
   - Header X-CSRF-Token debe coincidir
   - Protección contra CSRF attacks

4. Bases de datos separadas por dominio (Defense in Depth)
"""

from pydantic import BaseModel
import os


class Settings(BaseModel):
    """
    Configuración centralizada del sistema SFAS.
    En producción, configurar via variables de entorno.
    """
    
    # ══════════════════════════════════════════════════════════════════════════════
    # URLs de Bases de Datos Separadas (Defense in Depth)
    # ══════════════════════════════════════════════════════════════════════════════
    
    database_url_identidad: str = os.getenv(
        "DATABASE_URL_IDENTIDAD",
        "postgresql+psycopg://sfas:sfas_identidad_pass_2026@localhost:5432/sfas_identidad"
    )
    
    database_url_secretaria: str = os.getenv(
        "DATABASE_URL_SECRETARIA",
        "postgresql+psycopg://sfas:sfas_secretaria_pass_2026@localhost:5432/sfas_secretaria"
    )
    
    database_url_jueces: str = os.getenv(
        "DATABASE_URL_JUECES",
        "postgresql+psycopg://sfas:sfas_jueces_pass_2026@localhost:5432/sfas_jueces"
    )
    
    database_url_auditoria: str = os.getenv(
        "DATABASE_URL_AUDITORIA",
        "postgresql+psycopg://sfas:sfas_auditoria_pass_2026@localhost:5432/sfas_auditoria"
    )
    
    # ══════════════════════════════════════════════════════════════════════════════
    # Criptografía y Claves de Seguridad
    # ══════════════════════════════════════════════════════════════════════════════
    
    app_master_key: str = os.getenv("APP_MASTER_KEY", "SFAS_MASTER_KEY_2026_CHANGE_IN_PROD")
    
    # ══════════════════════════════════════════════════════════════════════════════
    # JWT Configuration (JSON Web Token con firma HS256)
    # CRÍTICO: En producción usar clave de 256+ bits
    # ══════════════════════════════════════════════════════════════════════════════
    
    jwt_secret_key: str = os.getenv(
        "JWT_SECRET_KEY",
        "SFAS_JWT_SECRET_2026_MIN_256_BITS_CHANGE_IN_PRODUCTION_IMMEDIATELY"
    )
    jwt_algorithm: str = "HS256"  # HMAC-SHA256
    jwt_expire_hours: int = 8     # Expiración del JWT
    
    # ══════════════════════════════════════════════════════════════════════════════
    # Cookie Configuration (HttpOnly para máxima seguridad contra XSS)
    # ══════════════════════════════════════════════════════════════════════════════
    
    # Cookie con JWT (HttpOnly = JS NO puede leerla = protección XSS)
    jwt_cookie_name: str = "sfas_jwt"
    jwt_cookie_httponly: bool = True
    jwt_cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    jwt_cookie_samesite: str = "lax"
    jwt_cookie_max_age: int = 3600 * 8  # 8 horas
    jwt_cookie_path: str = "/"
    
    # Cookie CSRF (NO HttpOnly - JS debe leerla para enviar en header)
    csrf_cookie_name: str = "sfas_csrf"
    csrf_header_name: str = "X-CSRF-Token"
    
    # ══════════════════════════════════════════════════════════════════════════════
    # Login Token (temporal, pre-OTP)
    # ══════════════════════════════════════════════════════════════════════════════
    
    login_token_expire_minutes: int = 5


settings = Settings()
