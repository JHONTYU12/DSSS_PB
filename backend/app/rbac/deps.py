"""
RBAC Dependencies con JWT Authentication.
Sistema de seguridad para Software Seguro.

Características:
- JWT Bearer Token Authentication
- Role-Based Access Control (RBAC)
- Esquema de seguridad OAuth2 para Swagger/OpenAPI
- Sin CSRF necesario (JWT no es vulnerable a CSRF)
"""

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..core.jwt_handler import validate_access_token
from ..db.session import SessionIdentidad
from ..db import models
import jwt

# Esquema de seguridad Bearer para Swagger UI
# Esto hace que Swagger muestre el botón "Authorize" con Bearer token
security_scheme = HTTPBearer(
    scheme_name="JWT Bearer Token",
    description="Ingresa tu JWT access_token obtenido de /auth/verify-otp",
    auto_error=True
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> dict:
    """
    Extrae y valida el JWT desde el header Authorization.
    
    Esta función:
    1. Extrae el token del header Authorization: Bearer <token>
    2. Valida la firma del token
    3. Verifica que no esté expirado
    4. Verifica que no esté en la blacklist (revocado)
    5. Retorna el payload con user_id, username, role
    
    Raises:
        HTTPException 401: Si el token es inválido, expirado o revocado
    """
    token = credentials.credentials
    
    try:
        payload = validate_access_token(token)
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401, 
            detail="Token expirado. Usa /auth/refresh para obtener un nuevo token.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=401, 
            detail=f"Token inválido: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )


def require_roles(*allowed_roles: str):
    """
    Dependency Factory para proteger endpoints con JWT y validar roles.
    
    Implementa:
    - Autenticación: Valida JWT Bearer token
    - Autorización: Verifica que el rol del usuario esté en allowed_roles
    - Admin tiene acceso universal a todos los endpoints
    
    Args:
        *allowed_roles: Roles permitidos (secretario, juez, admin, custodio, auditor)
    
    Returns:
        Función dependency que retorna el payload del JWT
    
    Raises:
        HTTPException 401: Token inválido o expirado
        HTTPException 403: Rol no autorizado
    
    Uso en routers:
        @router.get("/casos")
        def mis_casos(user: dict = Depends(require_roles("juez"))):
            user_id = user["user_id"]
            username = user["username"]
            role = user["role"]
            ...
    """
    def _dependency(
        credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
    ) -> dict:
        # Validar token
        token = credentials.credentials
        try:
            payload = validate_access_token(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=401,
                detail="Token expirado. Usa /auth/refresh para obtener un nuevo token.",
                headers={"WWW-Authenticate": "Bearer"}
            )
        except jwt.InvalidTokenError as e:
            raise HTTPException(
                status_code=401,
                detail=f"Token inválido: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # Verificar rol (admin tiene acceso universal)
        user_role = payload.get("role")
        if user_role != "admin" and user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Acceso denegado. Se requiere rol: {', '.join(allowed_roles)}"
            )
        
        return payload
    
    return _dependency


def require_auth():
    """
    Dependency para endpoints que solo requieren autenticación (cualquier rol).
    
    Uso:
        @router.get("/perfil")
        def mi_perfil(user: dict = Depends(require_auth())):
            return {"username": user["username"]}
    """
    def _dependency(
        credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
    ) -> dict:
        token = credentials.credentials
        try:
            return validate_access_token(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=401,
                detail="Token expirado",
                headers={"WWW-Authenticate": "Bearer"}
            )
        except jwt.InvalidTokenError as e:
            raise HTTPException(
                status_code=401,
                detail=f"Token inválido: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"}
            )
    
    return _dependency


def get_user_from_db(user_id: int):
    """
    Obtiene el usuario completo desde la BD usando el user_id del JWT.
    Útil cuando necesitas datos que no están en el JWT (como totp_secret).
    """
    db = SessionIdentidad()
    try:
        user = db.query(models.User).filter(
            models.User.id == user_id,
            models.User.is_active == True
        ).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return user
    finally:
        db.close()


# Alias para compatibilidad con código existente
require_roles_csrf = require_roles
