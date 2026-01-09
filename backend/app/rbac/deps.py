from fastapi import Cookie, Header, HTTPException, Request
from datetime import datetime, timezone
from ..core.settings import settings
from ..db.session import SessionIdentidad  # BD Identidades y Acceso
from ..db import models

def get_session_and_user(request: Request, sfas_session: str | None = None):
    if sfas_session is None:
        sfas_session = request.cookies.get("sfas_session")
    if not sfas_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    db = SessionIdentidad()
    try:
        s = db.query(models.Session).filter(models.Session.id == sfas_session).first()
        if not s or s.revoked:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if s.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        u = db.query(models.User).filter(models.User.id == s.user_id, models.User.is_active == True).first()
        if not u:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return s, u
    finally:
        db.close()

def require_csrf(x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"), **kwargs):
    s, u = get_session_and_user(**kwargs)
    if not x_csrf_token or x_csrf_token != s.csrf_token:
        raise HTTPException(status_code=403, detail="CSRF token missing/invalid")
    return s, u

def require_roles(*roles: str):
    def _dep(request: Request,
             sfas_session: str | None = Cookie(default=None, alias="sfas_session")):
        s, u = get_session_and_user(request=request, sfas_session=sfas_session)
        # Admin has universal access to all endpoints
        if u.role != "admin" and u.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return s, u
    return _dep

def require_roles_csrf(*roles: str):
    def _dep(request: Request,
             sfas_session: str | None = Cookie(default=None, alias="sfas_session"),
             x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")):
        db = SessionIdentidad()
        try:
            s = db.query(models.Session).filter(models.Session.id == sfas_session).first() if sfas_session else None
            if not s or s.revoked:
                raise HTTPException(status_code=401, detail="Not authenticated")
            if s.expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Session expired")
            u = db.query(models.User).filter(models.User.id == s.user_id, models.User.is_active == True).first()
            if not u:
                raise HTTPException(status_code=401, detail="Not authenticated")
            # Admin has universal access to all endpoints
            if u.role != "admin" and u.role not in roles:
                raise HTTPException(status_code=403, detail="Forbidden")
            if not x_csrf_token or x_csrf_token != s.csrf_token:
                raise HTTPException(status_code=403, detail="CSRF token missing/invalid")
            return s, u
        finally:
            db.close()
    return _dep
