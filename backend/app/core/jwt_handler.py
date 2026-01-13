"""
JWT Handler - Manejo seguro de tokens JWT
Implementa mejores prácticas de seguridad:
- Access tokens de corta duración (15 min)
- Refresh tokens de larga duración (7 días)
- Blacklist de tokens revocados (logout)
- Validación estricta de claims
"""

import jwt
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional
from .settings import settings

# Blacklist en memoria de tokens revocados (para logout)
# En producción, usar Redis o BD para persistencia
TOKEN_BLACKLIST: set[str] = set()


def create_access_token(user_id: int, username: str, role: str) -> str:
    """
    Crea un JWT access token de corta duración (15 min).
    Contiene: user_id, username, role, exp, iat, type
    """
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": now + timedelta(minutes=settings.jwt_access_token_expire_minutes),
        "iat": now,
        "type": "access"
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: int, username: str) -> str:
    """
    Crea un JWT refresh token de larga duración (7 días).
    Contiene: user_id, username, exp, iat, type
    NO contiene role por seguridad (debe renovarse con verificación)
    """
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": now + timedelta(days=settings.jwt_refresh_token_expire_days),
        "iat": now,
        "type": "refresh"
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Dict:
    """
    Decodifica y valida un JWT token.
    Lanza excepciones si el token es inválido, expirado o revocado.
    """
    # Verificar si el token está en la blacklist
    if token in TOKEN_BLACKLIST:
        raise jwt.InvalidTokenError("Token has been revoked")
    
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise jwt.ExpiredSignatureError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise jwt.InvalidTokenError(f"Invalid token: {str(e)}")


def revoke_token(token: str) -> None:
    """
    Revoca un token agregándolo a la blacklist.
    Usado en logout para invalidar tokens antes de expiración.
    """
    TOKEN_BLACKLIST.add(token)


def is_token_revoked(token: str) -> bool:
    """
    Verifica si un token está en la blacklist.
    """
    return token in TOKEN_BLACKLIST


def validate_access_token(token: str) -> Dict:
    """
    Valida que un token sea de tipo 'access' y no esté expirado.
    Retorna el payload decodificado.
    """
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Token is not an access token")
    return payload


def validate_refresh_token(token: str) -> Dict:
    """
    Valida que un token sea de tipo 'refresh' y no esté expirado.
    Retorna el payload decodificado.
    """
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("Token is not a refresh token")
    return payload
