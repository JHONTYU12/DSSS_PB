from fastapi import FastAPI, Request, Depends
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
from .rbac.deps import get_current_user, security_scheme

app = FastAPI(
    title="LexSecure SFAS API", 
    version="2.0",
    description="""
## Sistema de Firmas y Aperturas Seguras (SFAS)

### Autenticación JWT
1. `POST /auth/login` - Inicia sesión con usuario/contraseña
2. `POST /auth/verify-otp` - Verifica OTP y recibe tokens JWT
3. Usar `Authorization: Bearer <access_token>` en todas las peticiones
4. `POST /auth/refresh` - Renueva tokens cuando expire el access_token
5. `POST /auth/logout` - Revoca tokens

### Seguridad
- **Access Token**: Válido por 15 minutos
- **Refresh Token**: Válido por 7 días
- **2FA Obligatorio**: TOTP (Google Authenticator)
- **RBAC**: Control de acceso basado en roles
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
def whoami(user: dict = Depends(get_current_user)):
    """Obtiene información del usuario autenticado"""
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
    
    # Agregar esquema de seguridad JWT Bearer
    schema["components"] = schema.get("components", {})
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Ingresa tu access_token JWT obtenido de /auth/verify-otp"
        }
    }
    # Aplicar seguridad global a todos los endpoints protegidos
    # Esto hace que Swagger UI muestre el botón Authorize
    for path in schema.get("paths", {}).values():
        for operation in path.values():
            if isinstance(operation, dict) and "security" in operation:
                # Reemplazar el nombre del esquema para que coincida
                operation["security"] = [{"BearerAuth": []}]
    app.openapi_schema = schema
    return app.openapi_schema

app.openapi = custom_openapi
