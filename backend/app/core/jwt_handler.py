"""
JWT Handler - Manejo Seguro de Tokens JWT en Cookie HttpOnly
=============================================================

ARQUITECTURA DE SEGURIDAD:

1. JWT firmado con HS256 (HMAC-SHA256):
   - Clave secreta de 256+ bits
   - Payload: user_id, username, role, exp, iat, jti, csrf
   - El campo 'csrf' vincula el JWT con el token CSRF

2. Almacenamiento en Cookie HttpOnly:
   - JavaScript NO puede leer el JWT (protección XSS)
   - Se envía automáticamente con cada request

3. CSRF Protection (Double-Submit Cookie):
   - Token CSRF en cookie legible + header X-CSRF-Token
   - Backend valida que coincidan
   - Protege contra Cross-Site Request Forgery

4. Blacklist de tokens revocados:
   - Para logout seguro (invalidación antes de expiración)
   - En producción usar Redis para persistencia
"""

import jwt
import secrets
from datetime import datetime, timezone, timedelta
from typing import Dict
from .settings import settings

# Blacklist en memoria (en producción usar Redis)
TOKEN_BLACKLIST: set[str] = set()


def generate_csrf_token() -> str:
    """Genera un token CSRF criptográficamente seguro (32 hex chars)."""
    return secrets.token_hex(16)


def create_jwt_token(user_id: str, username: str, role: str, csrf_token: str) -> str:
    """
    Crea un JWT firmado con la información del usuario.
    
    El JWT contiene:
    - user_id: ID del usuario
    - username: Nombre de usuario
    - role: Rol del usuario (secretario, juez, admin, custodio, auditor)
    - csrf: Token CSRF vinculado (para validación double-submit)
    - exp: Fecha de expiración
    - iat: Fecha de creación
    - jti: ID único del token (para revocación)
    
    Args:
        user_id: ID del usuario autenticado
        username: Nombre de usuario
        role: Rol del usuario
        csrf_token: Token CSRF a vincular con este JWT
    
    Returns:
        JWT firmado como string
    """
    now = datetime.now(timezone.utc)
    jti = secrets.token_hex(16)  # ID único del token
    
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "csrf": csrf_token,  # Vinculación JWT-CSRF
        "exp": now + timedelta(hours=settings.jwt_expire_hours),
        "iat": now,
        "jti": jti,
        "iss": "SFAS-LexSecure",  # Issuer
        "aud": "SFAS-Users"       # Audience
    }
    
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_jwt_token(token: str) -> Dict:
    """
    Decodifica y valida un JWT.
    
    Validaciones:
    1. Firma válida (usando jwt_secret_key)
    2. No expirado (exp > now)
    3. No revocado (no está en blacklist)
    4. Issuer y audience correctos
    
    Args:
        token: JWT a decodificar
    
    Returns:
        Payload del JWT como dict
    
    Raises:
        jwt.ExpiredSignatureError: Token expirado
        jwt.InvalidTokenError: Token inválido o revocado
    """
    # Verificar si está en blacklist
    if token in TOKEN_BLACKLIST:
        raise jwt.InvalidTokenError("Token has been revoked")
    
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer="SFAS-LexSecure",
            audience="SFAS-Users"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise jwt.ExpiredSignatureError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise jwt.InvalidTokenError(f"Invalid token: {str(e)}")


def revoke_token(token: str) -> None:
    """
    Revoca un JWT agregándolo a la blacklist.
    Usado en logout para invalidar tokens antes de su expiración.
    
    Args:
        token: JWT a revocar
    """
    TOKEN_BLACKLIST.add(token)


def is_token_revoked(token: str) -> bool:
    """Verifica si un token está en la blacklist."""
    return token in TOKEN_BLACKLIST


def validate_csrf(jwt_payload: Dict, csrf_header: str | None) -> bool:
    """
    Valida que el token CSRF del header coincida con el del JWT.
    
    Esta es la validación del patrón Double-Submit Cookie:
    - El JWT contiene el CSRF token esperado
    - El header X-CSRF-Token contiene el token enviado por el cliente
    - Deben coincidir para que el request sea válido
    
    Args:
        jwt_payload: Payload decodificado del JWT
        csrf_header: Valor del header X-CSRF-Token
    
    Returns:
        True si coinciden, False si no
    """
    if not csrf_header:
        return False
    
    expected_csrf = jwt_payload.get("csrf")
    if not expected_csrf:
        return False
    
    # Comparación en tiempo constante para evitar timing attacks
    return secrets.compare_digest(expected_csrf, csrf_header)
