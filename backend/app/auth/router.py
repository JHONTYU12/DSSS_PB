from fastapi import APIRouter, HTTPException, Response, Request, Cookie
from pydantic import BaseModel, Field
from passlib.hash import bcrypt
import pyotp
import secrets
from datetime import datetime, timezone, timedelta
from ..db.session import SessionLocal
from ..db import models
from ..core.settings import settings
from ..audit.logger import log_event

router = APIRouter(prefix="/auth", tags=["auth"])

LOGIN_TOKENS: dict[str, dict] = {}  # in-memory (lab). token -> {user_id, expires_at}

class LoginReq(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)

class VerifyOtpReq(BaseModel):
    login_token: str
    otp: str = Field(min_length=6, max_length=6)

@router.post("/login")
def login(req: LoginReq, request: Request):
    db = SessionLocal()
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
    entry = LOGIN_TOKENS.get(req.login_token)
    if not entry:
        raise HTTPException(status_code=401, detail="OTP challenge expired")
    if entry["expires_at"] < datetime.now(timezone.utc):
        LOGIN_TOKENS.pop(req.login_token, None)
        raise HTTPException(status_code=401, detail="OTP challenge expired")

    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.id == entry["user_id"]).first()
        if not u or not u.is_active:
            raise HTTPException(status_code=401, detail="Invalid user")

        totp = pyotp.TOTP(u.totp_secret)
        if not totp.verify(req.otp, valid_window=1):
            log_event(actor=u.username, role=u.role, action="AUTH_OTP_VERIFY", ip=request.client.host if request.client else None,
                      success=False, details="invalid otp")
            raise HTTPException(status_code=401, detail="Invalid OTP")

        # Create session
        session_id = secrets.token_hex(16)
        csrf_token = secrets.token_hex(16)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(models.Session(id=session_id, user_id=u.id, csrf_token=csrf_token, expires_at=expires_at, revoked=False))
        db.commit()

        # Cookies
        cookie_kwargs = dict(
            httponly=True,
            secure=settings.cookie_secure,
            samesite="strict",
            path="/",
            max_age=3600,
        )
        if settings.cookie_domain:
            cookie_kwargs["domain"] = settings.cookie_domain

        response.set_cookie(key=settings.cookie_name, value=session_id, **cookie_kwargs)

        # CSRF cookie must be readable by JS
        csrf_kwargs = dict(
            httponly=False,
            secure=settings.cookie_secure,
            samesite="strict",
            path="/",
            max_age=3600,
        )
        if settings.cookie_domain:
            csrf_kwargs["domain"] = settings.cookie_domain
        response.set_cookie(key=settings.csrf_cookie_name, value=csrf_token, **csrf_kwargs)

        LOGIN_TOKENS.pop(req.login_token, None)
        log_event(actor=u.username, role=u.role, action="AUTH_LOGIN_SUCCESS", ip=request.client.host if request.client else None,
                  success=True, details="session created")
        return {"user_id": u.id, "username": u.username, "role": u.role}
    finally:
        db.close()

@router.post("/logout")
def logout(response: Response, request: Request, sfas_session: str | None = Cookie(default=None, alias="sfas_session")):
    if sfas_session:
        db = SessionLocal()
        try:
            s = db.query(models.Session).filter(models.Session.id == sfas_session).first()
            if s:
                s.revoked = True
                db.commit()
        finally:
            db.close()

    response.delete_cookie(settings.cookie_name, path="/")
    response.delete_cookie(settings.csrf_cookie_name, path="/")
    log_event(actor=None, role=None, action="AUTH_LOGOUT", ip=request.client.host if request.client else None,
              success=True, details="logout")
    return {"message": "logged out"}


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT DE DESARROLLO/DEMO: Obtener código TOTP actual
# En producción, esto DEBE ser eliminado o protegido
# ══════════════════════════════════════════════════════════════════════════════
class GetOtpReq(BaseModel):
    login_token: str

@router.post("/dev/get-otp")
def dev_get_current_otp(req: GetOtpReq):
    """
    [SOLO DESARROLLO/DEMO] Devuelve el código TOTP actual para el usuario.
    Esto permite probar sin necesidad de una app autenticadora.
    ⚠️ ELIMINAR EN PRODUCCIÓN
    """
    entry = LOGIN_TOKENS.get(req.login_token)
    if not entry:
        raise HTTPException(status_code=401, detail="Login token inválido o expirado")
    if entry["expires_at"] < datetime.now(timezone.utc):
        LOGIN_TOKENS.pop(req.login_token, None)
        raise HTTPException(status_code=401, detail="Login token expirado")

    db = SessionLocal()
    try:
        u = db.query(models.User).filter(models.User.id == entry["user_id"]).first()
        if not u or not u.is_active:
            raise HTTPException(status_code=401, detail="Usuario inválido")

        totp = pyotp.TOTP(u.totp_secret)
        current_code = totp.now()
        # Calcular segundos restantes de validez
        time_remaining = 30 - (datetime.now(timezone.utc).timestamp() % 30)
        
        return {
            "otp": current_code,
            "valid_for_seconds": int(time_remaining),
            "warning": "⚠️ Este endpoint es solo para desarrollo/demo"
        }
    finally:
        db.close()
