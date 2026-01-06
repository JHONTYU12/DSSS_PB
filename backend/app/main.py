from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from .db.init import init_db_and_seed
from .auth.router import router as auth_router
from .cases.router import router as secretaria_router
from .judge.router import router as juez_router
from .opening.router import router as opening_router
from .audit.router import router as audit_router
from .rbac.deps import get_session_and_user

app = FastAPI(title="LexSecure SFAS API", version="2.0")

# Only allow same-origin via nginx (frontend). Keep CORS tight.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:80", "http://127.0.0.1"],
    allow_credentials=True,
    allow_methods=["GET","POST","PUT","DELETE","OPTIONS"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    init_db_and_seed()

@app.get("/health", tags=["system"])
def health():
    return {"status":"ok"}

@app.get("/secure/whoami", tags=["secure"])
def whoami(request: Request):
    s, u = get_session_and_user(request)
    return {"username": u.username, "role": u.role}

app.include_router(auth_router)
app.include_router(secretaria_router)
app.include_router(juez_router)
app.include_router(opening_router)
app.include_router(audit_router)

# Swagger: explain cookie auth & CSRF
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
        description=(
            "Autenticación: /auth/login -> /auth/verify-otp crea cookie HttpOnly `sfas_session` y cookie `sfas_csrf`."
            "Para requests con estado (POST), enviar header `X-CSRF-Token` con el valor de la cookie `sfas_csrf`."
        )
    )
    app.openapi_schema = schema
    return app.openapi_schema

app.openapi = custom_openapi
