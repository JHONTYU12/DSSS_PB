# LexSecure SFAS - Sistema de Firmas y Aperturas Seguras
## Documentación Técnica Completa v2.0

**Última actualización**: Enero 2026  
**Arquitectura de Seguridad**: JWT en Cookie HttpOnly + CSRF Double-Submit Pattern

---

## Tabla de Contenidos

1. [Visión General del Sistema](#visión-general-del-sistema)
2. [Arquitectura de Seguridad](#arquitectura-de-seguridad)
3. [Estructura de Directorios](#estructura-de-directorios)
4. [Flujo de Autenticación](#flujo-de-autenticación)
5. [Componentes Backend](#componentes-backend)
6. [Componentes Frontend](#componentes-frontend)
7. [Base de Datos](#base-de-datos)
8. [Configuración de Seguridad](#configuración-de-seguridad)
9. [Docker y Despliegue](#docker-y-despliegue)
10. [Testing y Verificación](#testing-y-verificación)

---

## Visión General del Sistema

**LexSecure SFAS v2.0** es un sistema judicial seguro con arquitectura de seguridad de grado empresarial.

### **Funcionalidades Principales:**

1. **Consulta Pública de Casos** (sin autenticación)
   - Búsqueda de casos judiciales
   - Visualización de resoluciones firmadas
   - Verificación de autenticidad mediante hash SHA256
   - **NO expone información sensible de funcionarios**

2. **Sistema de Gestión Interna** (con autenticación 2FA + JWT)
   - **Secretarios**: Crear casos, asignar a jueces
   - **Jueces**: Crear y firmar resoluciones con hash SHA256
   - **Custodios**: Aprobar aperturas (esquema M-de-N)
   - **Auditores**: Visualización con pseudónimos HMAC
   - **Administradores**: Gestión de aperturas y usuarios

### **Principios de Seguridad Implementados:**

- ✅ **Defense in Depth**: Múltiples capas de seguridad
- ✅ **Least Privilege**: Cada rol solo accede a lo necesario
- ✅ **Privacy by Design**: Datos sensibles protegidos
- ✅ **Secure by Default**: Configuración segura desde el inicio
- ✅ **Zero Trust**: Validación en cada petición
- ✅ **Auditabilidad Total**: Todos los eventos registrados

---

## Arquitectura de Seguridad

### 🔐 JWT en Cookie HttpOnly + CSRF Protection

**¿Por qué NO usamos localStorage?**
- localStorage es accesible por JavaScript
- Si hay vulnerabilidad XSS, el atacante puede robar el token
- **Solución**: Cookie HttpOnly es INMUNE a XSS

#### Arquitectura Implementada:

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE (Navegador)                       │
│                                                               │
│  1. POST /auth/login                                         │
│     → {username, password}                                   │
│                                                               │
│  2. POST /auth/verify-otp                                    │
│     → {login_token, totp_code}                               │
│                                                               │
│  3. Backend responde con Set-Cookie:                         │
│     • sfas_jwt=<JWT>; HttpOnly; Secure; SameSite=Lax        │
│     • sfas_csrf=<CSRF>; Secure; SameSite=Lax                │
│                                                               │
│  4. Requests autenticados:                                   │
│     • Cookie: sfas_jwt=<JWT>  (automático)                  │
│     • X-CSRF-Token: <CSRF>    (leído de cookie sfas_csrf)   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                         │
│                                                               │
│  get_current_user():                                         │
│  1. Lee JWT de Cookie sfas_jwt                              │
│  2. Valida firma JWT con jwt_secret_key (HS256)             │
│  3. Verifica exp (expiración 8 horas)                       │
│  4. Verifica que no esté en blacklist                       │
│  5. Lee header X-CSRF-Token                                 │
│  6. Valida: jwt.payload.csrf == header[X-CSRF-Token]        │
│  7. Valida rol del usuario                                  │
│  8. Retorna payload: {user_id, username, role}              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 🔑 Estructura del JWT

**Archivo**: `backend/app/core/jwt_handler.py`

```python
# Payload del JWT
{
    "user_id": 1,
    "username": "admin",
    "role": "admin",
    "csrf": "abc123...",      # Token CSRF vinculado
    "exp": 1736890000,        # Expiración (8 horas)
    "iat": 1736861200,        # Issued At
    "jti": "uuid-unico",      # JWT ID (para revocación)
    "iss": "SFAS-LexSecure",  # Issuer
    "aud": "SFAS-Users"       # Audience
}
```

**Configuración**: `backend/app/core/settings.py`

```python
class Settings(BaseSettings):
    # JWT Configuration
    jwt_secret_key: str = "tu-clave-secreta-muy-larga-minimo-32-caracteres"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 8
    
    # Cookie Configuration
    jwt_cookie_name: str = "sfas_jwt"
    jwt_cookie_httponly: bool = True
    jwt_cookie_secure: bool = True  # HTTPS en producción
    jwt_cookie_samesite: str = "lax"
    
    csrf_cookie_name: str = "sfas_csrf"
```

### 🛡️ CSRF Protection - Double-Submit Cookie Pattern

**Archivo**: `backend/app/rbac/deps.py`

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
    
    if not validate_csrf(payload, x_csrf_token):
        raise HTTPException(403, "Token CSRF inválido")
    
    # 3. Validar que no esté revocado
    if is_token_revoked(sfas_jwt):
        raise HTTPException(401, "Token revocado")
    
    return payload
```

**Frontend**: `frontend/src/ui/api.js`

```javascript
// Leer CSRF de cookie (NO HttpOnly)
function getCsrfToken() {
  return getCookie("sfas_csrf");
}

// Enviar en todas las requests autenticadas
async function apiFetch(url, options = {}, csrf = true) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };
  
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
  
  return response;
}
```
│       └── public/            # API pública sin autenticación
│           ├── __init__.py
│           └── router.py      # Búsqueda pública de casos (sanitizada)
│
└── frontend/
    ├── Dockerfile             # Imagen Node + Vite
    ├── package.json           # Dependencias npm
    ├── vite.config.js         # Configuración Vite
    ├── index.html             # HTML base
    └── src/
        ├── main.jsx           # Entry point React
        └── ui/
            ├── api.js         # Funciones para llamar a la API
            ├── App.jsx        # Componente raíz + routing
            ├── styles.css     # Estilos globales (Liquid Glass)
            └── components/
                ├── common/             # Componentes reutilizables
                │   ├── index.js
                │   ├── Badge.jsx       # Badges de estado
                │   ├── Button.jsx      # Botones
                │   ├── Card.jsx        # Tarjetas glass
                │   ├── Input.jsx       # Inputs/TextArea/Select
                │   ├── Modal.jsx       # Modales
                │   ├── Table.jsx       # Tablas
                │   ├── Filters.jsx     # Chips/Tabs
                │   └── Toast.jsx       # Notificaciones
                ├── icons/              # SVG icons
                │   ├── index.js
                │   └── Icons.jsx       # Todos los iconos SVG
                ├── layout/             # Layout components
                │   ├── index.js
                │   └── Header.jsx      # Header con logo y logout
                ├── auth/               # Autenticación
                │   ├── index.js
                │   └── LoginForm.jsx   # Login + OTP
                ├── dashboard/          # Dashboards por rol
                │   ├── index.js
                │   ├── SecretaryDashboard.jsx
                │   ├── JudgeDashboard.jsx
                │   ├── AdminDashboard.jsx
                │   ├── CustodioDashboard.jsx
                │   └── AuditDashboard.jsx
                └── public/             # Vista pública
                    ├── index.js
                    └── PublicCaseSearch.jsx  # Búsqueda pública segura
```

---

## Flujo de Datos

### **Flujo 1: Usuario Público Consulta Casos**

```
Usuario → http://localhost → Nginx → Frontend (Vite dev server)
                                         ↓
                         Frontend renderiza PublicCaseSearch.jsx
                                         ↓
                         Usuario busca "Caso 123"
                                         ↓
                         fetch("/api/public/cases?q=Caso 123")
                                         ↓
                    Nginx → Backend:8000/public/cases
                                         ↓
                    router.py sanitiza datos (NO expone juez/secretario)
                                         ↓
                    PostgreSQL consulta Case + Resolution
                                         ↓
                    Retorna JSON: {case_number, title, status, resolution: {content, hash}}
                                         ↓
                         Frontend muestra en modal
```

**Seguridad:** 
- NO requiere autenticación
- NO expone `created_by`, `assigned_judge`, `signature` interna
- Solo expone: número de caso, título, estado sanitizado, texto de resolución, hash

### **Flujo 2: Secretario Crea un Caso**

```
Secretario → Login (username + password) → Backend verifica → OTP requerido
                                                ↓
                         Secretario ingresa OTP → Backend verifica TOTP
                                                ↓
                         Backend crea session + CSRF token
                                                ↓
                         Cookies: sfas_session (HttpOnly) + sfas_csrf
                                                ↓
                         Frontend: Dashboard de Secretario
                                                ↓
                         Click "Nuevo Caso" → Modal con formulario
                                                ↓
                         POST /api/secretaria/casos + X-CSRF-Token header
                                                ↓
                         Backend: require_roles_csrf("secretario") valida
                                                ↓
                         PostgreSQL: INSERT INTO cases
                                                ↓
                         Auditoría: log_event("CASE_CREATE")
                                                ↓
                         Retorna {case_id, case_number, status}
```

**Seguridad:**
- Autenticación 2FA (password + TOTP)
- CSRF token en header
- Validación de rol (solo secretario puede crear)
- Evento auditado con pseudónimo

### **Flujo 3: Juez Firma Resolución**

```
Juez → Autenticado → Dashboard de Juez
                         ↓
         Ve "Mis Casos" → Selecciona caso asignado
                         ↓
         Escribe resolución → Click "Firmar"
                         ↓
         POST /api/juez/resoluciones/{id}/firmar + CSRF
                         ↓
         Backend: require_roles_csrf("juez") valida
                         ↓
         Verifica que el caso esté asignado a este juez
                         ↓
         Calcula SHA256(contenido) → doc_hash
                         ↓
         Genera firma grupal simulada: "GRP_SIG_" + token
                         ↓
         UPDATE resolutions SET status='SIGNED', doc_hash, signature
                         ↓
         UPDATE cases SET status='RESOLUTION_SIGNED'
                         ↓
         Auditoría: log_event("RESOLUTION_SIGN")
                         ↓
         Retorna {resolution_id, hash, signature}
```

**Seguridad:**
- Solo el juez asignado puede firmar
- Firma grupal (oculta identidad en consulta pública)
- Hash SHA256 permite verificación pública
- Evento auditado

---

## Guía de Lectura del Código

### **Orden Recomendado para Entender el Sistema:**

#### **Paso 1: Configuración Base (5 archivos)**
1. `docker-compose.yml` - Ve cómo se conectan los servicios
2. `nginx/default.conf` - Entiende el routing y rate limiting
3. `backend/app/core/settings.py` - Configuración global
4. `backend/app/db/base.py` - Base de SQLAlchemy
5. `backend/app/db/session.py` - Conexión a PostgreSQL

#### **Paso 2: Modelos de Datos (1 archivo)**
6. `backend/app/db/models.py` - **CRÍTICO**: Lee todos los modelos (User, Case, Resolution, etc.)

#### **Paso 3: Punto de Entrada Backend (1 archivo)**
7. `backend/app/main.py` - FastAPI app + middleware + routers

#### **Paso 4: Autenticación y Autorización (2 archivos)**
8. `backend/app/auth/router.py` - Login + OTP + logout
9. `backend/app/rbac/deps.py` - Dependency injection para RBAC + CSRF

#### **Paso 5: Funcionalidades por Rol (5 archivos)**
10. `backend/app/cases/router.py` - Secretario: CRUD casos
11. `backend/app/judge/router.py` - Juez: crear/firmar resoluciones
12. `backend/app/opening/router.py` - Admin/Custodio: aperturas M-de-N
13. `backend/app/audit/router.py` - Auditor: consulta logs
14. `backend/app/audit/logger.py` - Sistema de logging con pseudónimos y redacción de details

#### **Paso 6: API Pública (1 archivo)**
15. `backend/app/public/router.py` - **CRÍTICO**: API sin autenticación, sanitizada

#### **Paso 7: Frontend - Punto de Entrada (3 archivos)**
16. `frontend/src/main.jsx` - Entry point React
17. `frontend/src/ui/App.jsx` - Routing (public/login/otp/app)
18. `frontend/src/ui/api.js` - Funciones fetch para backend

#### **Paso 8: Componentes UI Comunes (8 archivos)**
19. `frontend/src/ui/components/common/Badge.jsx`
20. `frontend/src/ui/components/common/Button.jsx`
21. `frontend/src/ui/components/common/Card.jsx`
22. `frontend/src/ui/components/common/Input.jsx`
23. `frontend/src/ui/components/common/Table.jsx`
24. `frontend/src/ui/components/common/Modal.jsx`
25. `frontend/src/ui/components/common/Toast.jsx`
26. `frontend/src/ui/components/icons/Icons.jsx`

#### **Paso 9: Vista Pública (1 archivo)**
27. `frontend/src/ui/components/public/PublicCaseSearch.jsx` - **CRÍTICO**: Búsqueda pública

#### **Paso 10: Autenticación Frontend (1 archivo)**
28. `frontend/src/ui/components/auth/LoginForm.jsx` - Login + OTP

#### **Paso 11: Dashboards por Rol (5 archivos)**
29-33. Los dashboards específicos por rol

---

## Instalación y Uso

### **Instalación Rápida:**

```bash
# 1. Navegar al directorio
cd /Users/josue/Downloads/final

# 2. Levantar todos los servicios
docker compose up -d --build

# 3. Acceder
# Vista Pública: http://localhost
# Login Personal: Click en "Acceso Personal"
```

### **Usuarios Demo:**
```
admin / Admin!2026_SFAS
juez1 / Juez!2026_SFAS
secret1 / Secret!2026_SFAS
cust1 / Cust!2026_SFAS
cust2 / Cust!2026_SFAS
audit1 / Audit!2026_SFAS
```

### **Ver Logs:**
```bash
docker compose logs backend | grep "TOTP URI"  # Para escanear QR del OTP
```

---

## Componentes Backend

### **1. main.py - Punto de Entrada**

```python
# Propósito: Inicializar FastAPI app con middleware y routers
# Middleware:
# - CORS: Permite requests desde frontend
# - ExceptionHandler: Manejo centralizado de errores
# Routers: auth, cases, judge, opening, audit, public
```

**Ubicación:** `backend/app/main.py`

**Responsabilidades:**
- Crear instancia de FastAPI app
- Configurar middleware CORS para permitir requests desde frontend
- Incluir todos los routers (auth, cases, judge, opening, audit, public)
- Definir endpoint de health check (`/api/health`)
- Crear tablas en BD al iniciar (en desarrollo)

### **2. core/settings.py - Configuración**

```python
# SECRET_KEY: Firma de cookies de sesión (cambiar en producción)
# DATABASE_URL: PostgreSQL connection string
# COOKIE_SETTINGS: HttpOnly, SameSite=Lax, Secure (solo HTTPS en producción)
```

**Ubicación:** `backend/app/core/settings.py`

**Variables importantes:**
- `SECRET_KEY`: Clave para firmar cookies de sesión (debe ser única en producción)
- `DATABASE_URL`: String de conexión a PostgreSQL
- `COOKIE_SETTINGS`: Configuración de seguridad para cookies (HttpOnly, SameSite, Secure)

### **3. db/models.py - Modelos ORM**

**Ubicación:** `backend/app/db/models.py`

**Modelo User:**
- `uuid` (PK): UUID v4 único
- `username` (unique): Nombre de usuario
- `password_hash`: Bcrypt hash (nunca plain text)
- `role`: Enum (secretario, juez, admin, custodio, auditor)
- `otp_secret`: Base32 secret para TOTP
- `otp_confirmed`: Boolean si completó el setup 2FA
- `active`: Boolean para desactivar usuarios

**Modelo Case:**
- `id` (PK): Int autoincremental
- `case_number` (unique): Identificador público (CASO-2026-001)
- `title`: Título del caso
- `description`: Descripción larga
- `status`: Enum workflow (CREATED → ASSIGNED → DRAFT_RESOLUTION → RESOLUTION_SIGNED → CLOSED)
- `created_by` (FK): UUID del secretario creador
- `assigned_judge` (FK): UUID del juez asignado

**Modelo Resolution:**
- `id` (PK): Int autoincremental
- `case_id` (FK): Referencia a Case
- `content`: Texto completo de la resolución
- `status`: Enum (DRAFT o SIGNED)
- `signature`: Firma grupal interna (GRP_SIG_...)
- `doc_hash`: SHA256 del contenido
- `created_by` (FK): UUID del juez que firmó
- `signed_at`: Timestamp de firma

**Modelo Session:**
- `session_id` (PK): UUID v4
- `user_id` (FK): UUID del usuario
- `csrf_token`: Token CSRF único
- `expires_at`: Timestamp de expiración
- `is_otp_verified`: Boolean si completó OTP

**Modelo Opening:**
- `id` (PK): Int autoincremental
- `name`: Nombre de la apertura
- `required_custodios`: M (de M-de-N)
- `status`: Enum (PENDING, COMPLETED, REJECTED)

**Modelo CustodioApproval:**
- Tabla de join many-to-many entre User (custodios) y Opening
- `approved_at`: Timestamp de aprobación

**Modelo AuditLog:**
- `id` (PK): Int autoincremental
- `event_type`: Tipo de evento (CASE_CREATE, RESOLUTION_SIGN, etc.)
- `user_id_hash`: HMAC del UUID (pseudónimo)
- `details`: JSON con metadata
- `timestamp`: Timestamp del evento

### **4. auth/router.py - Autenticación**

**Ubicación:** `backend/app/auth/router.py`

**POST /api/auth/login:**
1. Valida username + password (bcrypt)
2. Crea Session con csrf_token
3. Retorna cookie `sfas_session` + `sfas_csrf`
4. Si OTP no está confirmado → genera `otpauth://` URI
5. Requiere verificación OTP antes de acceso completo

**POST /api/auth/verify-otp:**
1. Valida código TOTP de 6 dígitos
2. Actualiza Session: `is_otp_verified = True`
3. Marca `User.otp_confirmed = True` (primera vez)
4. Retorna role del usuario

**POST /api/auth/logout:**
1. Elimina Session de BD
2. Borra cookies

### **5. rbac/deps.py - Autorización**

**Ubicación:** `backend/app/rbac/deps.py`

**Función require_roles_csrf:**
```python
def require_roles_csrf(*allowed_roles):
    """
    Dependency injection para FastAPI.
    
    Valida:
    1. Cookie sfas_session existe
    2. Session existe en BD y no expiró
    3. OTP fue verificado
    4. CSRF token en header X-CSRF-Token coincide con BD
    5. User.role está en allowed_roles
    
    Si falla cualquier validación → HTTPException 401/403
    
    Uso:
    @router.post("/casos", dependencies=[Depends(require_roles_csrf("secretario"))])
    def crear_caso(...):
        ...
    """
```

### **6. public/router.py - API Pública (SANITIZADA)**

**Ubicación:** `backend/app/public/router.py`

**GET /api/public/cases:**
- Búsqueda paginada de casos
- Parámetros: q (query), status (EN PROCESO/RESUELTO), page, page_size
- Retorna: SOLO datos públicos (case_number, title, status, resolution.content, resolution.hash)
- NUNCA expone: created_by, assigned_judge, signature, IDs internos

**GET /api/public/cases/{case_number}:**
- Detalle de un caso específico
- Retorna: misma estructura que /cases pero un solo objeto

**GET /api/public/verify/{case_number}?document_hash=...**
- Verifica autenticidad de una resolución
- Retorna: {verified: true/false, message, signed_date}

---

## Componentes Frontend

### **1. App.jsx - Router Principal**

**Ubicación:** `frontend/src/ui/App.jsx`

```jsx
/**
 * Estados posibles:
 * - "loading": Verificando sesión
 * - "public": Vista pública (sin auth)
 * - "login": Formulario de login
 * - "otp": Verificación TOTP
 * - "app": Dashboard según rol
 * 
 * Flujo:
 * 1. useEffect inicial → verifica si existe sesión
 * 2. Si no hay sesión → stage="public"
 * 3. Usuario click "Acceso Personal" → stage="login"
 * 4. Login exitoso sin OTP confirmado → stage="otp"
 * 5. OTP verificado → stage="app" + dashboard
 */
```

### **2. api.js - Funciones API**

**Ubicación:** `frontend/src/ui/api.js`

```javascript
// Todas las funciones usan fetch() con credentials: "include" (para cookies)
// CSRF token se lee de document.cookie y se envía en header X-CSRF-Token
// Funciones principales:
// - login(username, password)
// - verifyOtp(code)
// - logout()
// - fetchCases()
// - createCase(data)
// - createResolution(caseId, content)
// - signResolution(resolutionId)
// - etc.
```

### **3. PublicCaseSearch.jsx - Vista Pública**

**Ubicación:** `frontend/src/ui/components/public/PublicCaseSearch.jsx`

```jsx
/**
 * Estado del componente:
 * - searchQuery: Término de búsqueda
 * - statusFilter: "EN PROCESO" o "RESUELTO"
 * - cases: Array de resultados
 * - pagination: {page, page_size, total, total_pages}
 * - selectedCase: Caso seleccionado para modal
 * - verifyHash: Hash ingresado para verificar
 * - verifyResult: {verified, message}
 * 
 * Funciones principales:
 * - searchCases(page): fetch("/api/public/cases?...")
 * - viewCaseDetails(caseNumber): fetch("/api/public/cases/{}")
 * - handleVerify(): fetch("/api/public/verify/...?document_hash=...")
 * 
 * SEGURIDAD:
 * - NO usa cookies de sesión
 * - NO envía CSRF token
 * - Solo muestra datos ya sanitizados por backend
 */
```

### **4. LoginForm.jsx - Autenticación**

**Ubicación:** `frontend/src/ui/components/auth/LoginForm.jsx`

```jsx
/**
 * Flujo:
 * 1. Usuario ingresa username + password
 * 2. Click "Iniciar Sesión"
 * 3. POST /api/auth/login
 * 4. Si OTP no confirmado → muestra QR code
 * 5. Usuario escanea QR con Google Authenticator
 * 6. Ingresa código de 6 dígitos
 * 7. Click "Verificar"
 * 8. POST /api/auth/verify-otp
 * 9. Redirige a dashboard según rol
 */
```

### **5. Dashboards por Rol**

**SecretaryDashboard:**
- Ver todos los casos
- Crear nuevo caso
- Asignar caso a juez

**JudgeDashboard:**
- Ver casos asignados
- Crear resolución (DRAFT)
- Firmar resolución

**AdminDashboard:**
- Crear aperturas (M-de-N)
- Ver estado de aperturas

**CustodioDashboard:**
- Ver aperturas pendientes
- Aprobar aperturas

**AuditDashboard:**
- Ver logs de auditoría
- Filtrar por tipo de evento

---

## Seguridad

### **1. Autenticación (Quién eres)**

**Capa 1: Password**
- Bcrypt hash con salt (rounds=12)
- Nunca se almacena plain text
- Password requirements: mínimo 8 caracteres

**Capa 2: TOTP (Time-based One-Time Password)**
- RFC 6238 standard
- Código de 6 dígitos
- Válido por 30 segundos
- Implementado con PyOTP
- QR code generado con `otpauth://` URI

### **2. Autorización (Qué puedes hacer)**

**RBAC (Role-Based Access Control):**
```
secretario: crear casos, asignar jueces
juez: ver casos asignados, crear/firmar resoluciones
admin: crear aperturas
custodio: aprobar aperturas
auditor: ver logs
```

**CSRF Protection:**
- Token único por sesión
- Almacenado en BD (tabla Session)
- Enviado en cookie `sfas_csrf` (NO HttpOnly)
- Validado en header `X-CSRF-Token`
- Previene ataques CSRF

### **3. Sesiones**

**Cookies:**
- `sfas_session`: HttpOnly, SameSite=Lax, Secure (HTTPS)
  - Contiene session_id (UUID)
  - No puede ser leída por JavaScript (previene XSS)
- `sfas_csrf`: SameSite=Lax
  - Contiene csrf_token
  - Puede ser leída por JavaScript (necesario para enviar en header)

**Expiración:**
- Sesiones expiran después de 24 horas
- Cleanup automático de sesiones expiradas

### **4. Sanitización de Datos Públicos**

**Función _sanitize_case_for_public:**
```python
# NUNCA incluye:
- created_by (UUID del secretario)
- assigned_judge (UUID del juez)
- resolution.signature (firma grupal interna)
- IDs internos (case.id, resolution.id)
- Timestamps detallados

# Solo incluye:
- case_number (identificador público)
- title (título del caso)
- status (sanitizado: EN PROCESO/RESUELTO)
- resolution.content (texto de resolución)
- resolution.document_hash (SHA256)
- resolution.signed_date (fecha sin hora)
```

### **5. Rate Limiting (Nginx)**

```nginx
# Zona para API pública
limit_req_zone $binary_remote_addr zone=public_api:10m rate=10r/s;

# Zona para autenticación (previene brute force)
limit_req_zone $binary_remote_addr zone=auth_api:10m rate=5r/m;

# Aplicación:
location /api/public/ {
    limit_req zone=public_api burst=20 nodelay;
}

location /api/auth/ {
    limit_req zone=auth_api burst=5 nodelay;
}
```

### **6. Security Headers**

```nginx
# Content Security Policy: solo permite recursos propios
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

# XSS Protection
add_header X-XSS-Protection "1; mode=block" always;

# Previene clickjacking
add_header X-Frame-Options "DENY" always;

# Previene MIME sniffing
add_header X-Content-Type-Options "nosniff" always;
```

### **7. Auditoría con Pseudónimos y Redacción**

**Problema:** Logs de auditoría deben rastrear quién hizo qué, pero no deben permitir a auditores identificar funcionarios o exponer datos sensibles.

**Solución:**
- **Pseudónimos HMAC:** Para actor y target, se generan pseudónimos consistentes usando HMAC-SHA256.
- **Redacción de Details:** Los detalles se estructuran como JSON y se aplican políticas de redacción:
  - Usernames → `user_ref=<pseudónimo>`
  - IDs sensibles → `[REDACTED]`
  - Otros datos se preservan

```python
# logger.py
def redact_sensitive_details(details: dict | str) -> str:
    """
    Aplica política de redacción a details.
    - Usernames: reemplaza por user_ref=<HMAC>
    - IDs: [REDACTED]
    - Retorna JSON string estructurado
    """
    if isinstance(details, dict):
        redacted = {}
        for key, value in details.items():
            if key.lower() in ['username', 'user', 'actor']:
                redacted[key] = f"user_ref={pseudonymize(value, 'user')}"
            elif key.lower() in ['case_number', 'case_id', 'resolution_id']:
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = value
        return json.dumps(redacted)
    return redact_string_details(details)
```

**Ejemplo de log auditado:**
```json
{
  "actor_ref": "PSEUDONYM_a3f4b2c1",
  "role": "secretario",
  "action": "CASE_CREATE",
  "target_ref": "TARGET_5d7e9f2a",
  "details": "{\"case_number\": \"[REDACTED]\", \"assigned_judge\": \"user_ref=USER_8b4c2f9e\"}",
  "success": true
}
```

---

## Base de Datos

### **Diagrama ER:**

```
┌─────────────┐            ┌──────────────┐
│    User     │            │    Case      │
├─────────────┤            ├──────────────┤
│ uuid (PK)   │───────────<│ created_by   │
│ username    │            │ assigned_judge├───┐
│ password_hash│           │ case_number  │   │
│ role        │            │ title        │   │
│ otp_secret  │            │ status       │   │
└─────────────┘            └──────────────┘   │
       │                          │            │
       │                          ▼            │
       │                   ┌──────────────┐   │
       │                   │ Resolution   │   │
       │                   ├──────────────┤   │
       │                   │ case_id (FK) │   │
       │                   │ content      │   │
       │                   │ status       │   │
       │                   │ signature    │   │
       │                   │ doc_hash     │   │
       └───────────────────│ created_by   │<──┘
                           └──────────────┘

┌─────────────┐            ┌──────────────┐            ┌─────────────────┐
│    User     │            │   Opening    │            │CustodioApproval │
│ (custodio)  │            ├──────────────┤            ├─────────────────┤
├─────────────┤            │ name         │            │ opening_id (FK) │
│ uuid (PK)   │───────────<│ required_custodios│<─────│ custodio_id (FK)│
└─────────────┘            │ status       │            │ approved_at     │
                           └──────────────┘            └─────────────────┘

┌──────────────┐
│  AuditLog    │
├──────────────┤
│ event_type   │
│ user_id_hash │ <- Pseudónimo (no UUID real)
│ details      │ <- JSON
│ timestamp    │
└──────────────┘
```

### **Índices para Performance:**

```sql
-- Usuario por username (login)
CREATE INDEX idx_user_username ON "user"(username);

-- Casos por secretario
CREATE INDEX idx_case_created_by ON cases(created_by);

-- Casos por juez asignado
CREATE INDEX idx_case_assigned_judge ON cases(assigned_judge);

-- Casos por case_number (consulta pública)
CREATE UNIQUE INDEX idx_case_number ON cases(case_number);

-- Resoluciones por caso
CREATE INDEX idx_resolution_case_id ON resolutions(case_id);

-- Sesiones por session_id (validación)
CREATE INDEX idx_session_id ON sessions(session_id);

-- Logs por timestamp (auditoría)
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
```

---

## Docker y Despliegue

### **docker-compose.yml Explicado:**

```yaml
services:
  # PostgreSQL 16
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: sfas
      POSTGRES_PASSWORD: sfas_pass
      POSTGRES_DB: sfas_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sfas"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - sfas_net

  # Backend FastAPI
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: "postgresql://sfas:sfas_pass@postgres:5432/sfas_db"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - sfas_net
    command: >
      sh -c "python -m app.db.init && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

  # Frontend Vite
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    networks:
      - sfas_net
    command: npm run dev -- --host

  # Nginx Reverse Proxy
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
      - frontend
    networks:
      - sfas_net

networks:
  sfas_net:
    driver: bridge

volumes:
  postgres_data:
```

### **Dockerfile Backend:**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### **Dockerfile Frontend:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]
```

---

## Dependencias Principales

### **Backend (requirements.txt):**

```
fastapi==0.110.0          # Framework web async
uvicorn==0.27.1           # ASGI server
sqlalchemy==2.0.27        # ORM
psycopg2-binary==2.9.9    # Driver PostgreSQL
passlib==1.7.4            # Password hashing (bcrypt)
bcrypt==4.1.2             # Algoritmo bcrypt
pyotp==2.9.0              # TOTP (2FA)
qrcode==7.4.2             # Generación QR codes
pydantic==2.6.1           # Validación de datos
python-multipart==0.0.6   # Parsing form data
```

### **Frontend (package.json):**

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.8"
  }
}
```

---

## Debugging y Troubleshooting

### **Ver logs de un servicio:**

```bash
# Backend
docker compose logs backend -f

# Frontend
docker compose logs frontend -f

# Nginx
docker compose logs nginx -f

# PostgreSQL
docker compose logs postgres -f
```

### **Acceder a contenedor:**

```bash
# Backend (Python)
docker compose exec backend sh

# PostgreSQL (psql)
docker compose exec postgres psql -U sfas -d sfas_db
```

### **Verificar salud de servicios:**

```bash
# Health check backend
curl http://localhost/api/health

# Debe retornar: {"status":"ok"}
```

### **Errores comunes:**

**1. "502 Bad Gateway":**
- Backend no está corriendo
- Verificar: `docker compose ps`
- Ver logs: `docker compose logs backend`

**2. "Connection refused" a PostgreSQL:**
- Esperar a que PostgreSQL termine el health check
- Verificar: `docker compose logs postgres | grep "ready to accept"`

**3. "CSRF token mismatch":**
- Cookie `sfas_csrf` no está siendo enviada
- Verificar que frontend use `credentials: "include"`
- Verificar que nginx no esté bloqueando cookies

**4. "OTP code invalid":**
- Verificar que el reloj del sistema esté sincronizado
- TOTP es time-based (30 segundos de ventana)
- Probar con `date` en contenedor backend

---

## Despliegue en Producción

### **Cambios necesarios:**

1. **Secrets:**
   ```bash
   # Generar SECRET_KEY seguro
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   
   # Generar AUDIT_HMAC_KEY
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. **PostgreSQL:**
   - Usar servicio managed (AWS RDS, Azure Database, etc.)
   - Habilitar SSL/TLS
   - Cambiar password por uno fuerte

3. **Nginx:**
   - Habilitar HTTPS (Let's Encrypt)
   - Actualizar `Secure` flag en cookies
   - Configurar CSP más estricto

4. **Backend:**
   - Deshabilitar `--reload` en Uvicorn
   - Configurar workers: `uvicorn --workers 4`
   - Habilitar logging estructurado

5. **Rate Limiting:**
   - Ajustar según tráfico real
   - Considerar usar Redis para shared state

---

## Conclusión

Este sistema implementa:
**Autenticación robusta** (Password + 2FA)
**Autorización granular** (RBAC + CSRF)
**API pública segura** (sanitización de datos)
**Auditoría con privacidad** (pseudónimos HMAC)
**Firmas digitales** (SHA256 + verificación pública)
**Rate limiting** (prevención de abuso)
**Security headers** (XSS, Clickjacking, CSP)
**Separación de concerns** (Frontend/Backend/DB/Proxy)

### **Próximos pasos para explicar el código:**

1. Leer este README completo
2. Seguir la "Guía de Lectura del Código" (34 archivos numerados)
3. Revisar comentarios inline en cada archivo
4. Probar en localhost
5. Entender los flujos de datos (diagramas en sección 4)
6. Estudiar las garantías de seguridad (sección 8)


---

**Levantar en ngrok.**

se debe levantar el contenedor siempre 
 docker compose up -d --build

y levantar la url 
ngrok http 80
**Versión:** 1.0.0  
**Fecha:** 2026-01-08
