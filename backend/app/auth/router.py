from fastapi import APIRouter, HTTPException, Response, Request, Cookie
from pydantic import BaseModel, Field
from passlib.hash import bcrypt
import pyotp
import secrets
from datetime import datetime, timezone, timedelta
from ..db.session import SessionIdentidad  # BD Identidades y Acceso
from ..db import models
from ..core.settings import settings
from ..core.jwt_handler import (
    create_access_token,
    create_refresh_token,
    validate_refresh_token,
    revoke_token
)
from ..audit.logger import log_event

router = APIRouter(prefix="/auth", tags=["auth"])

LOGIN_TOKENS: dict[str, dict] = {}  # in-memory (lab). token -> {user_id, expires_at}

class LoginReq(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)

class VerifyOtpReq(BaseModel):
    login_token: str
    otp: str = Field(min_length=6, max_length=6)

class RefreshTokenReq(BaseModel):
    refresh_token: str

@router.post("/login")
def login(req: LoginReq, request: Request):
    db = SessionIdentidad()
    try:
        u = db.query(models.User).filter(models.User.username == req.username).first()
        if not u or not u.is_active or not bcrypt.verify(req.password, u.password_hash):
            log_event(actor=req.username, role=None, action="AUTH_LOGIN", ip=request.client.host if request.client else None,
                      success=False, details="invalid credentials")
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = secrets.token_hex(16)
        LOGIN_TOKENS[token] = {
            "user_id": u.id,
            "username": u.username,
            "role": u.role,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        }
        log_event(actor=u.username, role=u.role, action="AUTH_LOGIN_PASSWORD_OK", ip=request.client.host if request.client else None,
                  success=True, details="otp required")
        return {"otp_required": True, "login_token": token, "expires_in_seconds": 300}
    finally:
        db.close()

@router.post("/verify-otp")
def verify_otp(req: VerifyOtpReq, response: Response, request: Request):
    """
    Verifica el OTP y devuelve JWT tokens.
    Retorna:
    - access_token: JWT de corta duración (15 min) para autenticar requests
    - refresh_token: JWT de larga duración (7 días) para renovar access_token
    - token_type: "bearer"
    - expires_in: segundos hasta expiración del access_token
    """
    entry = LOGIN_TOKENS.get(req.login_token)
    if not entry:
        raise HTTPException(status_code=401, detail="OTP challenge expired")
    if entry["expires_at"] < datetime.now(timezone.utc):
        LOGIN_TOKENS.pop(req.login_token, None)
        raise HTTPException(status_code=401, detail="OTP challenge expired")

    db = SessionIdentidad()
    try:
        u = db.query(models.User).filter(models.User.id == entry["user_id"]).first()
        if not u or not u.is_active:
            raise HTTPException(status_code=401, detail="Invalid user")

        totp = pyotp.TOTP(u.totp_secret)
        current_otp = totp.now()
        print(f"[DEBUG] User: {u.username}, Secret: {u.totp_secret}, Current OTP: {current_otp}, Received OTP: {req.otp}")
        
        if not totp.verify(req.otp, valid_window=2):
            log_event(actor=u.username, role=u.role, action="AUTH_OTP_VERIFY", ip=request.client.host if request.client else None,
                      success=False, details=f"invalid otp - expected: {current_otp}, received: {req.otp}")
            raise HTTPException(status_code=401, detail="Invalid OTP")

        # Crear JWT tokens (mejores prácticas de seguridad)
        access_token = create_access_token(u.id, u.username, u.role)
        refresh_token = create_refresh_token(u.id, u.username)

        LOGIN_TOKENS.pop(req.login_token, None)
        log_event(actor=u.username, role=u.role, action="AUTH_LOGIN_SUCCESS", ip=request.client.host if request.client else None,
                  success=True, details="JWT tokens issued")
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.jwt_access_token_expire_minutes * 60,
            "user": {
                "user_id": u.id,
                "username": u.username,
                "role": u.role
            }
        }
    finally:
        db.close()

@router.post("/refresh")
def refresh(req: RefreshTokenReq, request: Request):
    """
    Renueva el access_token usando un refresh_token válido.
    Implementa rotación de refresh tokens por seguridad:
    - Valida el refresh token
    - Emite nuevo access_token
    - Emite nuevo refresh_token (rotación)
    - Revoca el refresh token antiguo
    """
    try:
        payload = validate_refresh_token(req.refresh_token)
    except Exception as e:
        log_event(actor=None, role=None, action="AUTH_REFRESH_FAILED", 
                  ip=request.client.host if request.client else None,
                  success=False, details=str(e))
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    db = SessionIdentidad()
    try:
        u = db.query(models.User).filter(
            models.User.id == payload["user_id"],
            models.User.username == payload["username"],
            models.User.is_active == True
        ).first()
        
        if not u:
            raise HTTPException(status_code=401, detail="User not found or inactive")

        # Crear nuevos tokens (rotación de refresh token por seguridad)
        new_access_token = create_access_token(u.id, u.username, u.role)
        new_refresh_token = create_refresh_token(u.id, u.username)
        
        # Revocar el refresh token antiguo (previene reuso)
        revoke_token(req.refresh_token)
        
        log_event(actor=u.username, role=u.role, action="AUTH_TOKEN_REFRESHED",
                  ip=request.client.host if request.client else None,
                  success=True, details="new tokens issued")
        
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": settings.jwt_access_token_expire_minutes * 60
        }
    finally:
        db.close()

@router.post("/logout")
def logout(request: Request):
    """
    Logout con revocación de tokens JWT.
    El cliente debe enviar el token en Authorization header.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        revoke_token(token)
        log_event(actor=None, role=None, action="AUTH_LOGOUT", 
                  ip=request.client.host if request.client else None,
                  success=True, details="token revoked")
    
    return {"message": "logged out"}
