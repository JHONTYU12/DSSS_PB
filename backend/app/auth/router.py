"""
Auth Router - Autenticación Segura con JWT en Cookie HttpOnly + CSRF
=====================================================================

ARQUITECTURA DE SEGURIDAD (Defense in Depth):

1. AUTENTICACIÓN 2FA:
   - Paso 1: username + password → login_token temporal (5 min)
   - Paso 2: login_token + OTP (TOTP) → JWT + CSRF tokens

2. JWT EN COOKIE HttpOnly:
   - Cookie sfas_jwt: HttpOnly=True (JavaScript NO puede leerla)
   - Protección XSS: incluso si hay XSS, no pueden robar el JWT
   - Se envía automáticamente con cada request

3. CSRF PROTECTION (Double-Submit Cookie):
   - Cookie sfas_csrf: HttpOnly=False (JS debe leerla)
   - Header X-CSRF-Token: debe coincidir con valor en JWT
   - Protección CSRF: atacante en otro sitio no puede hacer requests

4. FLUJO COMPLETO:
   POST /login → valida password → retorna login_token (5 min)
   POST /verify-otp → valida TOTP → setea cookies (JWT + CSRF)
   Requests → cookie sfas_jwt (automática) + header X-CSRF-Token
   POST /logout → revoca JWT + borra cookies
   GET /session → verifica sesión activa (para frontend)
"""

from fastapi import APIRouter, HTTPException, Response, Request, Cookie, Header
from pydantic import BaseModel, Field
from passlib.hash import bcrypt
import pyotp
import secrets
from datetime import datetime, timezone, timedelta
from ..db.session import SessionIdentidad
from ..db import models
from ..core.settings import settings
from ..core.jwt_handler import (
    create_jwt_token,
    decode_jwt_token,
    generate_csrf_token,
    revoke_token,
    validate_csrf
)
from ..audit.logger import log_event
import jwt

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory store para tokens de login (pre-OTP). En producción usar Redis.
LOGIN_TOKENS: dict[str, dict] = {}


class LoginReq(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)


class VerifyOtpReq(BaseModel):
    login_token: str
    otp: str = Field(min_length=6, max_length=6)


def set_auth_cookies(response: Response, jwt_token: str, csrf_token: str):
    """
    Configura las cookies de autenticación de forma segura.
    
    sfas_jwt: HttpOnly=True → JavaScript NO puede leerla (protección XSS)
    sfas_csrf: HttpOnly=False → JavaScript la lee para enviar en header
    """
    # Cookie con JWT - HttpOnly para proteger contra XSS
    response.set_cookie(
        key=settings.jwt_cookie_name,
        value=jwt_token,
        httponly=settings.jwt_cookie_httponly,  # True - JS no puede leerla
        secure=settings.jwt_cookie_secure,       # True en HTTPS
        samesite=settings.jwt_cookie_samesite,   # "lax" - protección CSRF parcial
        max_age=settings.jwt_cookie_max_age,     # 8 horas
        path=settings.jwt_cookie_path
    )
    
    # Cookie CSRF - NO HttpOnly porque JS debe leerla
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        httponly=False,  # JS debe poder leerla
        secure=settings.jwt_cookie_secure,
        samesite=settings.jwt_cookie_samesite,
        max_age=settings.jwt_cookie_max_age,
        path=settings.jwt_cookie_path
    )


def clear_auth_cookies(response: Response):
    """Elimina las cookies de autenticación."""
    response.delete_cookie(key=settings.jwt_cookie_name, path=settings.jwt_cookie_path)
    response.delete_cookie(key=settings.csrf_cookie_name, path=settings.jwt_cookie_path)


@router.post("/login")
def login(req: LoginReq, request: Request):
    """
    Paso 1: Validar credenciales (username + password)
    
    Retorna un login_token temporal (5 min) para continuar con OTP.
    NO crea sesión todavía - requiere verificación OTP primero.
    
    Returns:
        {
            "otp_required": true,
            "login_token": "...",
            "expires_in_seconds": 300
        }
    """
    db = SessionIdentidad()
    try:
        u = db.query(models.User).filter(models.User.username == req.username).first()
        
        if not u or not u.is_active or not bcrypt.verify(req.password, u.password_hash):
            log_event(
                actor=req.username, role=None, action="AUTH_LOGIN",
                ip=request.client.host if request.client else None,
                success=False, details="invalid credentials"
            )
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        
        # Generar token temporal para OTP challenge
        token = secrets.token_hex(16)
        LOGIN_TOKENS[token] = {
            "user_id": u.id,
            "username": u.username,
            "role": u.role,
            "expires_at": datetime.now(timezone.utc) + timedelta(
                minutes=settings.login_token_expire_minutes
            ),
        }
        
        log_event(
            actor=u.username, role=u.role, action="AUTH_LOGIN_PASSWORD_OK",
            ip=request.client.host if request.client else None,
            success=True, details="otp required"
        )
        
        return {
            "otp_required": True,
            "login_token": token,
            "expires_in_seconds": settings.login_token_expire_minutes * 60
        }
    finally:
        db.close()


@router.post("/verify-otp")
def verify_otp(req: VerifyOtpReq, response: Response, request: Request):
    """
    Paso 2: Verificar OTP y crear sesión segura
    
    Después de validar el código TOTP:
    1. Genera JWT firmado con información del usuario
    2. Genera token CSRF vinculado al JWT
    3. Setea cookies HttpOnly (sfas_jwt) + CSRF (sfas_csrf)
    
    Returns:
        {
            "success": true,
            "user": {"user_id": "...", "username": "...", "role": "..."},
            "expires_in_seconds": 28800
        }
    
    Cookies seteadas:
        - sfas_jwt: JWT firmado (HttpOnly)
        - sfas_csrf: Token CSRF (legible por JS)
    """
    # Validar login token
    entry = LOGIN_TOKENS.get(req.login_token)
    if not entry:
        raise HTTPException(status_code=401, detail="Token de login expirado")
    
    if entry["expires_at"] < datetime.now(timezone.utc):
        LOGIN_TOKENS.pop(req.login_token, None)
        raise HTTPException(status_code=401, detail="Token de login expirado")
    
    db = SessionIdentidad()
    try:
        u = db.query(models.User).filter(models.User.id == entry["user_id"]).first()
        if not u or not u.is_active:
            raise HTTPException(status_code=401, detail="Usuario inválido")
        
        # Verificar TOTP
        totp = pyotp.TOTP(u.totp_secret)
        
        if not totp.verify(req.otp, valid_window=2):
            log_event(
                actor=u.username, role=u.role, action="AUTH_OTP_VERIFY",
                ip=request.client.host if request.client else None,
                success=False, details="invalid otp"
            )
            raise HTTPException(status_code=401, detail="Código OTP inválido")
        
        # CREAR JWT + CSRF
        csrf_token = generate_csrf_token()
        jwt_token = create_jwt_token(u.id, u.username, u.role, csrf_token)
        
        # Limpiar token de login usado
        LOGIN_TOKENS.pop(req.login_token, None)
        
        # Setear cookies seguras
        set_auth_cookies(response, jwt_token, csrf_token)
        
        log_event(
            actor=u.username, role=u.role, action="AUTH_LOGIN_SUCCESS",
            ip=request.client.host if request.client else None,
            success=True, details="JWT in HttpOnly cookie + CSRF token set"
        )
        
        # Retornar info del usuario (NO tokens - están en cookies)
        return {
            "success": True,
            "user": {
                "user_id": u.id,
                "username": u.username,
                "role": u.role
            },
            "expires_in_seconds": settings.jwt_expire_hours * 3600
        }
    finally:
        db.close()


@router.get("/session")
def get_session_info(
    request: Request,
    sfas_jwt: str | None = Cookie(default=None)
):
    """
    Verificar si hay sesión activa.
    
    El frontend usa esto al cargar para verificar si el usuario está logueado.
    Lee el JWT de la cookie HttpOnly y valida su firma.
    
    Returns:
        {"authenticated": true/false, "user": {...}}
    """
    if not sfas_jwt:
        return {"authenticated": False}
    
    try:
        payload = decode_jwt_token(sfas_jwt)
        
        # Verificar que el usuario sigue activo en BD
        db = SessionIdentidad()
        try:
            user = db.query(models.User).filter(
                models.User.id == payload["user_id"],
                models.User.is_active == True
            ).first()
            
            if not user:
                return {"authenticated": False}
            
            return {
                "authenticated": True,
                "user": {
                    "user_id": user.id,
                    "username": user.username,
                    "role": user.role
                }
            }
        finally:
            db.close()
            
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return {"authenticated": False}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    sfas_jwt: str | None = Cookie(default=None)
):
    """
    Cerrar sesión de forma segura.
    
    1. Revoca el JWT (lo agrega a blacklist)
    2. Borra las cookies del navegador
    
    Incluso si alguien tiene el JWT, ya no será válido.
    """
    if sfas_jwt:
        try:
            payload = decode_jwt_token(sfas_jwt)
            revoke_token(sfas_jwt)
            
            log_event(
                actor=payload.get("username", "unknown"),
                role=payload.get("role"),
                action="AUTH_LOGOUT",
                ip=request.client.host if request.client else None,
                success=True, details="JWT revoked"
            )
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass  # Token ya expiró o es inválido, igual borramos cookies
    
    clear_auth_cookies(response)
    
    return {"success": True, "message": "Sesión cerrada"}


@router.get("/whoami")
def whoami(
    request: Request,
    sfas_jwt: str | None = Cookie(default=None),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")
):
    """
    Obtener información del usuario actual.
    Requiere JWT válido + CSRF token correcto.
    
    Este endpoint demuestra la validación completa:
    1. JWT en cookie HttpOnly (automático)
    2. CSRF token en header (enviado por JS)
    """
    if not sfas_jwt:
        raise HTTPException(status_code=401, detail="No autenticado")
    
    try:
        payload = decode_jwt_token(sfas_jwt)
        
        # Validar CSRF
        if not validate_csrf(payload, x_csrf_token):
            raise HTTPException(status_code=403, detail="CSRF token inválido")
        
        return {
            "user_id": payload["user_id"],
            "username": payload["username"],
            "role": payload["role"]
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {str(e)}")
