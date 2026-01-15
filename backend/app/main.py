from fastapi import FastAPI, Request, Depends, Cookie, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from .db.init import init_db_and_seed
from .auth.router import router as auth_router
from .cases.router import router as secretaria_router
from .judge.router import router as juez_router
from .opening.router import router as opening_router
from .audit.router import router as audit_router
from .public.router import router as public_router
from .recordings.router import router as recordings_router
from .rbac.deps import require_auth

app = FastAPI(
    title="LexSecure SFAS API", 
    version="2.0",
    description="""
## Sistema de Firmas y Aperturas Seguras (SFAS)

### Autenticación: JWT en Cookie HttpOnly + CSRF

**Arquitectura de Seguridad:**
- JWT firmado con HS256 almacenado en Cookie HttpOnly (protección XSS)
- Token CSRF para protección contra CSRF attacks
- 2FA obligatorio con TOTP (Google Authenticator)

**Flujo de Autenticación:**
1. `POST /auth/login` - Valida usuario/contraseña → retorna login_token
2. `POST /auth/verify-otp` - Valida TOTP → setea cookies (sfas_jwt + sfas_csrf)
3. Requests autenticados: Cookie automática + Header X-CSRF-Token
4. `GET /auth/session` - Verifica sesión activa
5. `POST /auth/logout` - Revoca JWT y borra cookies

### Roles (RBAC)
- **admin**: Gestión completa del sistema
- **juez**: Crear y firmar resoluciones
- **secretario**: Crear y gestionar casos
- **custodio**: Aprobar aperturas M-de-N
- **auditor**: Consultar logs de auditoría
"""
)

# Only allow same-origin via nginx (frontend). Keep CORS tight.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir cualquier origen para ngrok/desarrollo
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
def whoami(user: dict = Depends(require_auth())):
    """Obtiene información del usuario autenticado (requiere JWT + CSRF)"""
    return {"username": user["username"], "role": user["role"], "user_id": user["user_id"]}

app.include_router(auth_router)
app.include_router(secretaria_router)
app.include_router(juez_router)
app.include_router(opening_router)
app.include_router(audit_router)
app.include_router(public_router)  # Public endpoints - no auth required
app.include_router(recordings_router)  # Security recordings

# Swagger: JWT Bearer Authentication Schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
        description=app.description
    )
    
    # Configurar servers con prefijo /api (para nginx)
    schema["servers"] = [
        {
            "url": "/api",
            "description": "API Server (production)"
        },
        {
            "url": "http://localhost/api",
            "description": "Local development"
        }
    ]
    
    # Agregar esquema de seguridad Cookie + CSRF
    schema["components"] = schema.get("components", {})
    schema["components"]["securitySchemes"] = {
        "CookieAuth": {
            "type": "apiKey",
            "in": "cookie",
            "name": "sfas_jwt",
            "description": "JWT en cookie HttpOnly (se envía automáticamente)"
        },
        "CSRFToken": {
            "type": "apiKey",
            "in": "header",
            "name": "X-CSRF-Token",
            "description": "Token CSRF (leer de cookie sfas_csrf)"
        }
    }
    # Aplicar seguridad global a todos los endpoints protegidos
    for path in schema.get("paths", {}).values():
        for operation in path.values():
            if isinstance(operation, dict) and "security" in operation:
                operation["security"] = [{"CookieAuth": [], "CSRFToken": []}]
    app.openapi_schema = schema
    return app.openapi_schema

app.openapi = custom_openapi
