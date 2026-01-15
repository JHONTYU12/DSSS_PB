"""
RBAC Dependencies - JWT en Cookie HttpOnly + CSRF Protection
=============================================================

ARQUITECTURA DE SEGURIDAD:

1. JWT en Cookie HttpOnly (sfas_jwt):
   - Se lee automáticamente de la cookie
   - JavaScript NO puede acceder (protección XSS)
   - Firmado con HS256 (HMAC-SHA256)

2. CSRF Protection (Double-Submit Cookie):
   - Token CSRF vinculado al JWT (campo 'csrf' en payload)
   - Cliente envía token en header X-CSRF-Token
   - Backend valida que coincidan
   - Protege contra Cross-Site Request Forgery

3. Role-Based Access Control (RBAC):
   - require_roles("secretario", "juez") → solo esos roles
   - require_auth() → cualquier usuario autenticado
   - Admin tiene acceso universal

FLUJO DE VALIDACIÓN:
1. Extraer JWT de cookie sfas_jwt
2. Validar firma del JWT (jwt_secret_key)
3. Verificar que no esté expirado
4. Verificar que no esté revocado (blacklist)
5. Validar CSRF: header X-CSRF-Token == jwt.csrf
6. Verificar rol del usuario
"""

from fastapi import HTTPException, Request, Cookie, Header
from ..core.jwt_handler import decode_jwt_token, validate_csrf
from ..core.settings import settings
from ..db.session import SessionIdentidad
from ..db import models
import jwt


def get_current_user(
    request: Request,
    sfas_jwt: str | None = Cookie(default=None),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")
) -> dict:
    """
    Extrae y valida el usuario desde JWT en cookie + CSRF.
    
    Esta función:
    1. Lee el JWT de la cookie HttpOnly (sfas_jwt)
    2. Valida la firma del JWT
    3. Verifica que no esté expirado
    4. Verifica que no esté revocado
    5. Valida el token CSRF (X-CSRF-Token header == jwt.csrf)
    6. Retorna el payload con user_id, username, role
    
    Args:
        request: FastAPI Request object
        sfas_jwt: JWT desde cookie HttpOnly (automático)
        x_csrf_token: Token CSRF desde header (enviado por JS)
    
    Returns:
        dict: Payload del JWT con user_id, username, role
    
    Raises:
        HTTPException 401: JWT no presente, expirado o inválido
        HTTPException 403: CSRF token no coincide
    """
    if not sfas_jwt:
        raise HTTPException(
            status_code=401,
            detail="No autenticado - Cookie de sesión no encontrada"
        )
    
    try:
        payload = decode_jwt_token(sfas_jwt)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Sesión expirada - Por favor inicia sesión nuevamente"
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Token inválido: {str(e)}"
        )
    
    # Validar CSRF (Double-Submit Cookie Pattern)
    if not validate_csrf(payload, x_csrf_token):
        raise HTTPException(
            status_code=403,
            detail="CSRF token inválido o faltante"
        )
    
    return payload


def require_roles(*allowed_roles: str):
    """
    Dependency Factory para proteger endpoints con JWT + CSRF + Roles.
    
    Implementa:
    - Autenticación: Valida JWT en cookie HttpOnly
    - CSRF Protection: Valida header X-CSRF-Token
    - Autorización: Verifica rol del usuario
    - Admin tiene acceso universal
    
    Args:
        *allowed_roles: Roles permitidos (secretario, juez, admin, custodio, auditor)
    
    Returns:
        Función dependency que retorna el payload del JWT
    
    Raises:
        HTTPException 401: JWT inválido o expirado
        HTTPException 403: CSRF inválido o rol no autorizado
    
    Uso:
        @router.get("/casos")
        def mis_casos(user: dict = Depends(require_roles("juez"))):
            user_id = user["user_id"]
            username = user["username"]
            role = user["role"]
    """
    def _dependency(
        request: Request,
        sfas_jwt: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")
    ) -> dict:
        # Validar JWT + CSRF
        if not sfas_jwt:
            raise HTTPException(
                status_code=401,
                detail="No autenticado"
            )
        
        try:
            payload = decode_jwt_token(sfas_jwt)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=401,
                detail="Sesión expirada"
            )
        except jwt.InvalidTokenError as e:
            raise HTTPException(
                status_code=401,
                detail=f"Token inválido: {str(e)}"
            )
        
        # Validar CSRF
        if not validate_csrf(payload, x_csrf_token):
            raise HTTPException(
                status_code=403,
                detail="CSRF token inválido"
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
    
    Valida:
    - JWT en cookie HttpOnly
    - CSRF token en header
    - Usuario activo
    
    Uso:
        @router.get("/perfil")
        def mi_perfil(user: dict = Depends(require_auth())):
            return {"username": user["username"]}
    """
    def _dependency(
        request: Request,
        sfas_jwt: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")
    ) -> dict:
        if not sfas_jwt:
            raise HTTPException(
                status_code=401,
                detail="No autenticado"
            )
        
        try:
            payload = decode_jwt_token(sfas_jwt)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=401,
                detail="Sesión expirada"
            )
        except jwt.InvalidTokenError as e:
            raise HTTPException(
                status_code=401,
                detail=f"Token inválido: {str(e)}"
            )
        
        # Validar CSRF
        if not validate_csrf(payload, x_csrf_token):
            raise HTTPException(
                status_code=403,
                detail="CSRF token inválido"
            )
        
        return payload
    
    return _dependency


def get_user_from_db(user_id: str):
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
