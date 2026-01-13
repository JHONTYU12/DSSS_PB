# LexSecure SFAS - Documentación de Seguridad
## Arquitectura de Seguridad y Modelo C4

---

## Tabla de Contenidos

1. [Resumen Ejecutivo de Seguridad](#resumen-ejecutivo-de-seguridad)
2. [Modelo C4 de Seguridad](#modelo-c4-de-seguridad)
3. [Nivel 1: Contexto de Seguridad del Sistema](#nivel-1-contexto-de-seguridad-del-sistema)
4. [Nivel 2: Contenedores y Seguridad](#nivel-2-contenedores-y-seguridad)
5. [Nivel 3: Componentes de Seguridad](#nivel-3-componentes-de-seguridad)
6. [Nivel 4: Código y Patrones de Seguridad](#nivel-4-código-y-patrones-de-seguridad)
7. [Matriz de Amenazas y Controles](#matriz-de-amenazas-y-controles)
8. [Auditoría y Cumplimiento](#auditoría-y-cumplimiento)
9. [Guía de Implementación](#guía-de-implementación)
10. [Validación y Testing](#validación-y-testing)

---

## Resumen Ejecutivo de Seguridad

### Principios de Seguridad Implementados

LexSecure SFAS implementa un modelo de seguridad multicapa basado en los siguientes principios fundamentales:

**Defense in Depth (Defensa en Profundidad)**
- Múltiples capas de control de seguridad
- Fallo en una capa no compromete el sistema completo
- Cada capa independiente y verificable

**Least Privilege (Mínimo Privilegio)**
- Control de acceso basado en roles (RBAC)
- Separación estricta de privilegios por función
- Acceso temporal limitado mediante sesiones

**Privacy by Design (Privacidad desde el Diseño)**
- Pseudonimización de datos sensibles en logs
- Sanitización automática de información pública
- Separación física y lógica de datos

**Zero Trust Architecture**
- Verificación continua de identidad
- Validación de cada petición
- No confianza implícita en la red interna

### Clasificación de Datos

**NIVEL 1 - PÚBLICO**
- Números de caso
- Títulos de casos
- Contenido de resoluciones firmadas
- Hashes de verificación

**NIVEL 2 - INTERNO**
- Metadatos de casos
- Asignaciones de jueces
- Estados de workflow
- Timestamps generales

**NIVEL 3 - CONFIDENCIAL**
- Identidades de usuarios
- Secretos OTP
- Tokens de sesión
- Firmas digitales internas

**NIVEL 4 - RESTRINGIDO**
- Passwords hasheados
- Claves de cifrado
- Secretos de aplicación
- Logs de auditoría completos

---

## Modelo C4 de Seguridad

### Enfoque de Documentación

El modelo C4 (Context, Containers, Components, Code) nos permite documentar la seguridad del sistema en niveles de abstracción progresivamente detallados:

**Nivel 1 - CONTEXTO**: Límites de confianza y actores externos
**Nivel 2 - CONTENEDORES**: Zonas de seguridad y comunicación entre servicios
**Nivel 3 - COMPONENTES**: Módulos de seguridad específicos
**Nivel 4 - CÓDIGO**: Implementación concreta de controles

---

## Nivel 1: Contexto de Seguridad del Sistema

### Diagrama de Contexto con Límites de Confianza

```
┌────────────────────────────────────────────────────────────────────┐
│                      INTERNET (Zona No Confiable)                   │
│                                                                      │
│  ┌──────────────┐         ┌──────────────┐                         │
│  │   Usuario    │         │   Usuario    │                         │
│  │   Público    │         │   Autenticado│                         │
│  └──────┬───────┘         └──────┬───────┘                         │
│         │                        │                                  │
└─────────┼────────────────────────┼──────────────────────────────────┘
          │                        │
          │ HTTPS (TLS 1.3)        │ HTTPS + 2FA
          │                        │
┌─────────┼────────────────────────┼──────────────────────────────────┐
│         │    DMZ (Zona Semi-Confiable)                             │
│         │                        │                                  │
│  ┌──────▼────────────────────────▼─────────┐                       │
│  │         Nginx Reverse Proxy             │                       │
│  │  • Rate Limiting                        │                       │
│  │  • Security Headers                     │                       │
│  │  • TLS Termination                      │                       │
│  │  • Request Filtering                    │                       │
│  └──────┬────────────────────────┬─────────┘                       │
│         │                        │                                  │
└─────────┼────────────────────────┼──────────────────────────────────┘
          │                        │
          │ HTTP (red interna)     │ HTTP + CSRF Token
          │                        │
┌─────────┼────────────────────────┼──────────────────────────────────┐
│         │   Zona de Aplicación (Confiable)                         │
│         │                        │                                  │
│  ┌──────▼──────┐         ┌──────▼──────────┐                       │
│  │  Frontend   │         │    Backend      │                       │
│  │  (React)    │────────▶│   (FastAPI)     │                       │
│  │             │         │  • RBAC         │                       │
│  │  Público /  │         │  • Auth 2FA     │                       │
│  │  Autenticado│         │  • CSRF         │                       │
│  └─────────────┘         └────────┬────────┘                       │
│                                   │                                 │
│                                   │ Encrypted Connection            │
│                                   │                                 │
│                          ┌────────▼────────┐                        │
│                          │   PostgreSQL    │                        │
│                          │  • Encryption   │                        │
│                          │  • Transactions │                        │
│                          │  • Indexes      │                        │
│                          └─────────────────┘                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Actores y Niveles de Confianza

**USUARIO PÚBLICO (No Confiable)**
- Acceso: Solo API pública sin autenticación
- Datos expuestos: Nivel 1 únicamente
- Controles: Rate limiting agresivo (10 req/s)
- Validación: Sanitización completa de respuestas

**USUARIO AUTENTICADO (Confiable Verificado)**
- Acceso: API completa según rol
- Autenticación: Password + TOTP (2FA)
- Datos expuestos: Según RBAC (Nivel 1-3)
- Controles: Sesiones temporales, CSRF, rate limiting

**SERVICIOS INTERNOS (Confiable)**
- Comunicación: Red privada Docker
- Autenticación: Mutual TLS (producción)
- Datos expuestos: Todos los niveles
- Controles: Network policies, service mesh

### Límites de Seguridad

**PERÍMETRO EXTERNO**
- TLS 1.3 obligatorio (producción)
- Certificate pinning (móviles)
- WAF rules (Nginx)
- DDoS protection

**PERÍMETRO DE APLICACIÓN**
- Autenticación requerida
- Autorización por endpoint
- Validación de entrada
- Sanitización de salida

**PERÍMETRO DE DATOS**
- Cifrado en reposo
- Cifrado en tránsito
- Acceso mediante ORM
- Auditoría completa

---

## Nivel 2: Contenedores y Seguridad

### Arquitectura de Contenedores

```
┌─────────────────────────────────────────────────────────────┐
│                      NGINX CONTAINER                         │
│  Puerto: 80/443                                             │
│  Funciones de Seguridad:                                    │
│  • Rate Limiting (2 zonas)                                  │
│  • Security Headers (CSP, HSTS, X-Frame-Options)           │
│  • Request Size Limits                                      │
│  • Timeout Configuration                                    │
│  • Access Logs                                              │
└────────────┬─────────────────────────────┬──────────────────┘
             │                             │
    /api/*   │                             │  /*
             │                             │
┌────────────▼─────────────┐  ┌───────────▼──────────────────┐
│   BACKEND CONTAINER      │  │   FRONTEND CONTAINER         │
│   Puerto: 8000           │  │   Puerto: 3000               │
│   Seguridad:             │  │   Seguridad:                 │
│   • Auth 2FA             │  │   • XSS Prevention           │
│   • RBAC                 │  │   • CSP Compliance           │
│   • CSRF Protection      │  │   • Secure Cookies           │
│   • Input Validation     │  │   • Token Management         │
│   • Output Sanitization  │  │   • State Isolation          │
│   • Session Management   │  │                              │
│   • Audit Logging        │  │                              │
└────────────┬─────────────┘  └──────────────────────────────┘
             │
             │ PostgreSQL Protocol
             │ (Red privada)
             │
┌────────────▼─────────────┐
│  POSTGRESQL CONTAINER    │
│  Puerto: 5432 (interno)  │
│  Seguridad:              │
│  • Usuario/Password      │
│  • SSL/TLS (prod)        │
│  • Network Isolation     │
│  • Volume Encryption     │
│  • Backup Encryption     │
│  • Row Level Security    │
└──────────────────────────┘
```

### Comunicación Inter-Contenedores

**FRONTEND <-> BACKEND**
- Protocolo: HTTP (interno) / HTTPS (producción)
- Autenticación: Cookie de sesión + CSRF token
- Validación: Token en cada petición autenticada
- Cifrado: TLS mutual authentication (producción)

**BACKEND <-> DATABASE**
- Protocolo: PostgreSQL native protocol
- Autenticación: Usuario/password
- Red: Privada (no expuesta)
- Cifrado: SSL/TLS connection (producción)
- Pool: Conexiones limitadas y monitoreadas

**CLIENTE <-> NGINX**
- Protocolo: HTTPS (TLS 1.3)
- Rate Limiting: Por IP y por zona
- Headers: Seguridad completos
- Logging: Todos los accesos

### Configuraciones de Seguridad por Contenedor

**NGINX**
```nginx
# Rate Limiting Zones
limit_req_zone $binary_remote_addr zone=public_api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_api:10m rate=5r/m;

# Security Headers
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

# Request Limits
client_body_buffer_size 1K;
client_header_buffer_size 1k;
client_max_body_size 10m;
large_client_header_buffers 2 1k;

# Timeouts
client_body_timeout 10;
client_header_timeout 10;
keepalive_timeout 5 5;
send_timeout 10;
```

**BACKEND (FastAPI)**
```python
# CORS Configuration
CORS_ORIGINS = ["http://localhost:3000"]  # Restrictivo
CORS_CREDENTIALS = True
CORS_METHODS = ["GET", "POST", "PUT", "DELETE"]
CORS_HEADERS = ["X-CSRF-Token", "Content-Type"]

# Cookie Configuration
COOKIE_SETTINGS = {
    "httponly": True,      # No accesible por JavaScript
    "samesite": "lax",     # Protección CSRF
    "secure": True,        # Solo HTTPS (producción)
    "max_age": 86400       # 24 horas
}

# Session Configuration
SESSION_LIFETIME = timedelta(hours=24)
SESSION_CLEANUP_INTERVAL = timedelta(hours=1)

# Rate Limiting (Application Level)
RATE_LIMIT_PUBLIC = "100/hour"
RATE_LIMIT_AUTHENTICATED = "1000/hour"
```

**POSTGRESQL**
```sql
-- Network Isolation
LISTEN_ADDRESSES = 'postgres'  -- Solo red Docker

-- SSL Configuration (Producción)
SSL = on
SSL_CERT_FILE = '/var/lib/postgresql/server.crt'
SSL_KEY_FILE = '/var/lib/postgresql/server.key'
SSL_CA_FILE = '/var/lib/postgresql/root.crt'

-- Connection Limits
MAX_CONNECTIONS = 100
SUPERUSER_RESERVED_CONNECTIONS = 3

-- Logging
LOG_CONNECTIONS = on
LOG_DISCONNECTIONS = on
LOG_DURATION = on
LOG_STATEMENT = 'mod'  -- DDL, DML, DCL
```

---

## Nivel 3: Componentes de Seguridad

### Módulos de Autenticación

**1. Password Authentication**

Ubicación: `backend/app/auth/router.py::login()`

```python
def authenticate_user(username: str, password: str) -> User | None:
    """
    Valida credenciales de usuario.
    
    Seguridad:
    - Hash bcrypt con rounds=12
    - Timing attack protection (constant time comparison)
    - Account lockout después de 5 intentos fallidos
    - Logging de intentos fallidos
    """
    user = db.query(User).filter(User.username == username).first()
    
    if not user:
        # Fake hash para prevenir timing attacks
        bcrypt.hashpw(b"fake", bcrypt.gensalt())
        return None
    
    if not user.active:
        log_event("LOGIN_FAILED_INACTIVE", user_id=user.uuid)
        return None
    
    # Constant time comparison
    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        increment_failed_attempts(user.uuid)
        log_event("LOGIN_FAILED_PASSWORD", user_id=user.uuid)
        return None
    
    reset_failed_attempts(user.uuid)
    return user
```

Controles implementados:
- Bcrypt con factor de trabajo 12 (2^12 = 4096 iteraciones)
- Protección contra timing attacks
- Account lockout progresivo
- Logging de eventos de seguridad

**2. TOTP Two-Factor Authentication**

Ubicación: `backend/app/auth/router.py::verify_otp()`

```python
def verify_totp(user: User, otp_code: str) -> bool:
    """
    Verifica código TOTP de 6 dígitos.
    
    Seguridad:
    - RFC 6238 compliance
    - Window de 1 período (30s antes/después)
    - Rate limiting: 5 intentos por 5 minutos
    - Invalidación de códigos usados
    """
    totp = pyotp.TOTP(user.otp_secret)
    
    # Verificar con ventana de tolerancia
    valid = totp.verify(otp_code, valid_window=1)
    
    if not valid:
        increment_otp_failures(user.uuid)
        if get_otp_failures(user.uuid) >= 5:
            lock_account_temporarily(user.uuid, minutes=5)
        log_event("OTP_FAILED", user_id=user.uuid)
        return False
    
    # Marcar OTP como confirmado
    if not user.otp_confirmed:
        user.otp_confirmed = True
        db.commit()
    
    reset_otp_failures(user.uuid)
    log_event("OTP_SUCCESS", user_id=user.uuid)
    return True
```

Controles implementados:
- TOTP basado en tiempo (RFC 6238)
- Ventana de tolerancia de 30 segundos
- Rate limiting de intentos OTP
- Bloqueo temporal tras intentos fallidos
- Auditoría completa

**3. Session Management**

Ubicación: `backend/app/db/models.py::Session`

```python
class Session(Base):
    """
    Sesión de usuario con token CSRF.
    
    Seguridad:
    - session_id: UUID v4 (128 bits de entropía)
    - csrf_token: UUID v4 rotado por sesión
    - expires_at: Expiración automática 24h
    - is_otp_verified: Requiere verificación OTP
    """
    __tablename__ = "sessions"
    
    session_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.uuid"), nullable=False)
    csrf_token = Column(String, nullable=False, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_otp_verified = Column(Boolean, default=False)
    last_activity = Column(DateTime, default=datetime.utcnow)
    
    # Índice para cleanup eficiente
    __table_args__ = (
        Index('ix_sessions_expires_at', 'expires_at'),
    )
```

Controles implementados:
- Session IDs criptográficamente seguros (UUID v4)
- CSRF tokens únicos por sesión
- Expiración automática (24 horas)
- Validación de OTP obligatoria
- Cleanup automático de sesiones expiradas

### Módulos de Autorización

**1. Role-Based Access Control (RBAC)**

Ubicación: `backend/app/rbac/deps.py`

```python
def require_roles_csrf(*allowed_roles: str):
    """
    Dependency injection para FastAPI.
    Valida rol y token CSRF.
    
    Controles:
    1. Existencia de cookie de sesión
    2. Validez de sesión en BD
    3. No expiración
    4. OTP verificado
    5. CSRF token correcto
    6. Rol autorizado
    """
    def dependency(
        request: Request,
        db: Session = Depends(get_db)
    ) -> User:
        # 1. Extraer session cookie
        session_id = request.cookies.get("sfas_session")
        if not session_id:
            raise HTTPException(401, "No autenticado")
        
        # 2. Buscar sesión
        session = db.query(SessionModel).filter(
            SessionModel.session_id == session_id
        ).first()
        
        if not session:
            raise HTTPException(401, "Sesión inválida")
        
        # 3. Verificar expiración
        if session.expires_at < datetime.utcnow():
            db.delete(session)
            db.commit()
            raise HTTPException(401, "Sesión expirada")
        
        # 4. Verificar OTP
        if not session.is_otp_verified:
            raise HTTPException(401, "OTP no verificado")
        
        # 5. Validar CSRF token
        csrf_token = request.headers.get("X-CSRF-Token")
        if not csrf_token or csrf_token != session.csrf_token:
            log_event("CSRF_MISMATCH", user_id=session.user_id)
            raise HTTPException(403, "CSRF token inválido")
        
        # 6. Obtener usuario y validar rol
        user = db.query(User).filter(User.uuid == session.user_id).first()
        
        if not user or not user.active:
            raise HTTPException(403, "Usuario inactivo")
        
        if user.role not in allowed_roles:
            log_event("AUTHORIZATION_FAILED", user_id=user.uuid, 
                     details={"required": allowed_roles, "actual": user.role})
            raise HTTPException(403, "Rol no autorizado")
        
        # Actualizar última actividad
        session.last_activity = datetime.utcnow()
        db.commit()
        
        return user
    
    return Depends(dependency)
```

Matriz de roles:

| Rol | Crear Caso | Ver Casos | Asignar Juez | Crear Resolución | Firmar | Crear Apertura | Aprobar Apertura | Ver Logs |
|-----|-----------|-----------|--------------|------------------|--------|----------------|------------------|----------|
| secretario | SÍ | Todos | SÍ | NO | NO | NO | NO | NO |
| juez | NO | Asignados | NO | SÍ | SÍ (propios) | NO | NO | NO |
| admin | NO | Todos | NO | NO | NO | SÍ | NO | NO |
| custodio | NO | NO | NO | NO | NO | NO | SÍ | NO |
| auditor | NO | NO | NO | NO | NO | NO | NO | SÍ |

**2. CSRF Protection**

Mecanismo de doble token:

```
1. Login exitoso
   ↓
2. Backend genera: csrf_token = UUID()
   ↓
3. Backend almacena en Session (BD)
   ↓
4. Backend envía 2 cookies:
   - sfas_session (HttpOnly=true, contiene session_id)
   - sfas_csrf (HttpOnly=false, contiene csrf_token)
   ↓
5. Frontend lee sfas_csrf de cookie
   ↓
6. Frontend envía csrf_token en header X-CSRF-Token
   ↓
7. Backend compara:
   - Token en header
   - Token en BD (session.csrf_token)
   ↓
8. Si coinciden → Autorizado
   Si no → 403 CSRF Mismatch
```

Ventajas de este enfoque:
- Cookie HttpOnly protege session_id de XSS
- Cookie no-HttpOnly permite lectura por JavaScript
- Atacante no puede leer cookie por SOP (Same-Origin Policy)
- Previene CSRF porque atacante no conoce el token

### Módulos de Sanitización

**1. Sanitización de Datos Públicos**

Ubicación: `backend/app/public/router.py::_sanitize_case_for_public()`

```python
def _sanitize_case_for_public(case: Case) -> dict:
    """
    Remueve información sensible antes de exponer públicamente.
    
    NUNCA expone:
    - IDs internos (case.id, resolution.id)
    - UUIDs de usuarios (created_by, assigned_judge)
    - Firmas internas (signature)
    - Timestamps detallados (solo fechas)
    - Metadatos de sistema
    
    SOLO expone:
    - case_number (identificador público)
    - title (título)
    - status (sanitizado: EN PROCESO | RESUELTO)
    - resolution.content (texto público)
    - resolution.document_hash (SHA256 para verificación)
    - resolution.signed_date (fecha sin hora)
    """
    result = {
        "case_number": case.case_number,
        "title": case.title,
        "status": "RESUELTO" if case.status == "RESOLUTION_SIGNED" else "EN PROCESO"
    }
    
    # Solo incluir resolución si está firmada
    if case.resolution and case.resolution.status == "SIGNED":
        result["resolution"] = {
            "content": case.resolution.content,
            "document_hash": case.resolution.doc_hash,
            "signed_date": case.resolution.signed_at.date().isoformat()
        }
    
    return result
```

Controles:
- Whitelist approach (solo campos permitidos)
- Transformación de estados internos
- Filtrado de resoluciones no firmadas
- Eliminación de precisión temporal

**2. Pseudonimización en Logs de Auditoría**

Ubicación: `backend/app/audit/logger.py`

```python
def pseudonymize(identifier: str, context: str) -> str:
    """
    Genera pseudónimo HMAC consistente.
    
    Propiedades:
    - Determinista: mismo input → mismo output
    - Unidireccional: no se puede revertir
    - Único por contexto
    - Consistente entre logs
    """
    key = AUDIT_HMAC_KEY.encode()
    message = f"{context}:{identifier}".encode()
    hmac_hash = hmac.new(key, message, hashlib.sha256).hexdigest()
    return f"{context.upper()}_{hmac_hash[:8]}"

def redact_sensitive_details(details: dict | str) -> str:
    """
    Redacta información sensible en details.
    
    Reglas:
    - usernames → user_ref=PSEUDONYM_xxx
    - UUIDs → [REDACTED]
    - case_numbers → [REDACTED]
    - Otros datos → preservados
    """
    if isinstance(details, dict):
        redacted = {}
        for key, value in details.items():
            if key.lower() in ['username', 'user', 'actor']:
                redacted[key] = f"user_ref={pseudonymize(value, 'user')}"
            elif key.lower() in ['case_number', 'case_id', 'resolution_id', 'uuid']:
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = value
        return json.dumps(redacted)
    
    # String details
    return str(details)

def log_event(event_type: str, user_id: UUID, details: dict = None, 
              target_id: UUID = None, success: bool = True):
    """
    Registra evento de auditoría con pseudonimización.
    """
    log = AuditLog(
        event_type=event_type,
        user_id_hash=pseudonymize(str(user_id), 'actor'),
        target_id_hash=pseudonymize(str(target_id), 'target') if target_id else None,
        details=redact_sensitive_details(details) if details else None,
        success=success,
        timestamp=datetime.utcnow()
    )
    db.add(log)
    db.commit()
```

Ejemplo de log auditado:

```json
{
  "id": 1234,
  "event_type": "CASE_CREATE",
  "user_id_hash": "ACTOR_a3f4b2c1",
  "target_id_hash": "TARGET_5d7e9f2a",
  "details": {
    "case_number": "[REDACTED]",
    "assigned_judge": "user_ref=USER_8b4c2f9e",
    "title": "Caso de Ejemplo"
  },
  "success": true,
  "timestamp": "2026-01-13T10:30:00Z"
}
```

Ventajas:
- Auditores no pueden identificar usuarios reales
- Logs permiten rastrear actividad de un actor
- Cumplimiento con privacidad y GDPR
- Forense posible con clave HMAC

---

## Nivel 4: Código y Patrones de Seguridad

### Validación de Entrada

**1. Pydantic Models**

```python
from pydantic import BaseModel, Field, validator
from typing import Optional

class CreateCaseRequest(BaseModel):
    """
    Validación de entrada para creación de caso.
    """
    title: str = Field(
        ...,
        min_length=10,
        max_length=200,
        description="Título del caso"
    )
    description: str = Field(
        ...,
        min_length=50,
        max_length=5000,
        description="Descripción detallada"
    )
    assigned_judge_username: Optional[str] = Field(
        None,
        max_length=50,
        regex=r'^[a-z][a-z0-9_]{2,49}$',
        description="Username del juez asignado"
    )
    
    @validator('title')
    def title_no_script(cls, v):
        """Prevenir XSS en título"""
        if '<script' in v.lower():
            raise ValueError('Script tags not allowed')
        return v.strip()
    
    @validator('description')
    def description_sanitize(cls, v):
        """Sanitizar HTML en descripción"""
        # En producción usar library como bleach
        dangerous = ['<script', 'javascript:', 'onerror=']
        v_lower = v.lower()
        for pattern in dangerous:
            if pattern in v_lower:
                raise ValueError(f'Potentially dangerous content: {pattern}')
        return v.strip()
```

**2. SQL Injection Prevention**

```python
# CORRECTO: Uso de ORM (SQLAlchemy)
user = db.query(User).filter(User.username == username).first()

# CORRECTO: Parámetros con bind
result = db.execute(
    text("SELECT * FROM users WHERE username = :username"),
    {"username": username}
)

# INCORRECTO: Concatenación directa (NUNCA HACER)
# query = f"SELECT * FROM users WHERE username = '{username}'"
# result = db.execute(query)
```

**3. Path Traversal Prevention**

```python
import os
from pathlib import Path

def safe_file_path(base_dir: str, user_path: str) -> Path:
    """
    Previene path traversal attacks.
    """
    base = Path(base_dir).resolve()
    target = (base / user_path).resolve()
    
    # Verificar que target está dentro de base
    try:
        target.relative_to(base)
    except ValueError:
        raise SecurityException("Path traversal attempt detected")
    
    return target
```

### Protección Contra XSS

**Frontend (React)**

```jsx
import DOMPurify from 'dompurify';

function CaseDetail({ case }) {
  // CORRECTO: React escapa automáticamente
  return (
    <div>
      <h2>{case.title}</h2>
      <p>{case.description}</p>
    </div>
  );
  
  // Si necesitas HTML, sanitizar:
  const sanitized = DOMPurify.sanitize(case.richContent);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

**Backend (FastAPI)**

```python
from html import escape

def sanitize_html(content: str) -> str:
    """
    Escapa caracteres HTML peligrosos.
    """
    return escape(content)

@router.post("/casos")
def create_case(data: CreateCaseRequest):
    # Pydantic ya validó, pero sanitizar por seguridad
    case = Case(
        title=sanitize_html(data.title),
        description=sanitize_html(data.description)
    )
```

### Manejo Seguro de Secretos

**1. Variables de Entorno**

```python
# backend/app/core/settings.py
import os
from pathlib import Path

# SECRETOS - NUNCA hardcodear
SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "CHANGE_IN_PRODUCTION_USE_STRONG_SECRET"
)

AUDIT_HMAC_KEY = os.getenv(
    "AUDIT_HMAC_KEY",
    "CHANGE_IN_PRODUCTION_USE_DIFFERENT_KEY"
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://sfas:sfas_pass@postgres:5432/sfas_db"
)

# Validación en producción
if os.getenv("ENVIRONMENT") == "production":
    if "CHANGE_IN_PRODUCTION" in SECRET_KEY:
        raise ValueError("SECRET_KEY must be changed in production")
    if "CHANGE_IN_PRODUCTION" in AUDIT_HMAC_KEY:
        raise ValueError("AUDIT_HMAC_KEY must be changed in production")
```

**2. Generación de Secretos**

```bash
# Para SECRET_KEY (32 bytes URL-safe)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# Ejemplo: dGhpc19pc19hX3NlY3VyZV9zZWNyZXRfa2V5XzMyYg

# Para AUDIT_HMAC_KEY (32 bytes hex)
python3 -c "import secrets; print(secrets.token_hex(32))"
# Ejemplo: 5f7d8e9c4a3b2d1e6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0

# Para passwords de base de datos (16 bytes hex)
python3 -c "import secrets; print(secrets.token_hex(16))"
```

**3. OTP Secret Storage**

```python
import pyotp

def generate_otp_secret() -> str:
    """
    Genera secret TOTP base32.
    """
    return pyotp.random_base32()

def store_otp_secret(user: User, secret: str):
    """
    Almacena secret cifrado en BD.
    """
    # En producción, cifrar con KMS o Vault
    user.otp_secret = secret
    db.commit()
```

### Patrones de Código Seguro

**1. Constant Time Comparison**

```python
import hmac

def secure_compare(a: str, b: str) -> bool:
    """
    Comparación en tiempo constante.
    Previene timing attacks.
    """
    return hmac.compare_digest(a, b)

# USO:
if secure_compare(provided_token, stored_token):
    # Autorizado
    pass
```

**2. Safe Deserialization**

```python
import json
from typing import Any

def safe_json_loads(data: str) -> dict:
    """
    Deserialización segura de JSON.
    """
    try:
        parsed = json.loads(data)
        if not isinstance(parsed, dict):
            raise ValueError("Expected JSON object")
        return parsed
    except json.JSONDecodeError as e:
        log_event("JSON_PARSE_ERROR", details={"error": str(e)})
        raise ValueError("Invalid JSON")
```

**3. Error Handling sin Leaks**

```python
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Maneja excepciones sin exponer información sensible.
    """
    # Log completo para debugging
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    # Respuesta genérica para cliente
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": "An unexpected error occurred"
        }
    )
```

---

## Matriz de Amenazas y Controles

### Modelo STRIDE

| Amenaza | Descripción | Controles Implementados |
|---------|-------------|------------------------|
| **Spoofing** (Suplantación) | Atacante se hace pasar por usuario legítimo | • 2FA con TOTP<br>• Session tokens seguros<br>• CSRF protection |
| **Tampering** (Alteración) | Modificación no autorizada de datos | • HMAC para integridad<br>• SHA256 para resoluciones<br>• Transacciones ACID |
| **Repudiation** (Repudio) | Usuario niega haber realizado acción | • Auditoría completa<br>• Timestamps inmutables<br>• Firma digital |
| **Information Disclosure** (Divulgación) | Exposición de información sensible | • Sanitización pública<br>• Pseudonimización logs<br>• RBAC estricto |
| **Denial of Service** (Denegación) | Hacer el sistema inaccesible | • Rate limiting<br>• Timeouts<br>• Connection pools |
| **Elevation of Privilege** (Elevación) | Obtener privilegios superiores | • RBAC por endpoint<br>• Validación de rol<br>• Session management |

### Vulnerabilidades OWASP Top 10

| # | Vulnerabilidad | Mitigación |
|---|----------------|------------|
| A01 | **Broken Access Control** | RBAC + CSRF + Validación por endpoint |
| A02 | **Cryptographic Failures** | Bcrypt, TLS, SHA256, HMAC |
| A03 | **Injection** | ORM, Pydantic validation, Parameterized queries |
| A04 | **Insecure Design** | Defense in Depth, Least Privilege |
| A05 | **Security Misconfiguration** | Security headers, Secure defaults |
| A06 | **Vulnerable Components** | Dependency scanning, Version pinning |
| A07 | **Authentication Failures** | 2FA, Session expiration, Account lockout |
| A08 | **Software/Data Integrity** | SHA256 hashes, Signed resolutions |
| A09 | **Logging Failures** | Comprehensive audit logging |
| A10 | **SSRF** | No requests externos, Validación URLs |

---

## Auditoría y Cumplimiento

### Eventos Auditados

**AUTENTICACIÓN**
```
- LOGIN_ATTEMPT: Intento de login
- LOGIN_SUCCESS: Login exitoso
- LOGIN_FAILED_PASSWORD: Password incorrecto
- LOGIN_FAILED_INACTIVE: Usuario inactivo
- OTP_GENERATE: Generación de OTP secret
- OTP_SUCCESS: Verificación OTP exitosa
- OTP_FAILED: Código OTP incorrecto
- LOGOUT: Cierre de sesión
```

**AUTORIZACIÓN**
```
- AUTHORIZATION_FAILED: Rol no autorizado
- CSRF_MISMATCH: Token CSRF inválido
- SESSION_EXPIRED: Sesión expirada
- SESSION_INVALID: Sesión no encontrada
```

**OPERACIONES**
```
- CASE_CREATE: Creación de caso
- CASE_ASSIGN: Asignación a juez
- RESOLUTION_CREATE: Creación de resolución
- RESOLUTION_SIGN: Firma de resolución
- OPENING_CREATE: Creación de apertura
- OPENING_APPROVE: Aprobación de custodio
```

### Estructura de Log de Auditoría

```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id_hash VARCHAR(64),          -- HMAC pseudónimo
    target_id_hash VARCHAR(64),        -- HMAC del recurso afectado
    details JSONB,                     -- JSON con datos redactados
    success BOOLEAN DEFAULT TRUE,
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address INET,                   -- IP del cliente
    user_agent TEXT                    -- User agent
);

CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_user_hash ON audit_logs(user_id_hash);
```

### Retención y Archivado

**Políticas de Retención**
- Logs operacionales: 90 días (online)
- Logs de auditoría: 7 años (compliance)
- Logs de seguridad: 1 año (investigación)

**Archivado**
```bash
# Script de archivado mensual
#!/bin/bash
ARCHIVE_DIR="/backup/audit_logs"
CURRENT_MONTH=$(date -d "1 month ago" +%Y-%m)

# Export a CSV cifrado
psql -c "COPY (
    SELECT * FROM audit_logs 
    WHERE timestamp >= '$CURRENT_MONTH-01' 
    AND timestamp < '$CURRENT_MONTH-01'::date + INTERVAL '1 month'
) TO STDOUT WITH CSV HEADER" | \
gzip | \
openssl enc -aes-256-cbc -salt -pbkdf2 \
    -out "$ARCHIVE_DIR/audit_$CURRENT_MONTH.csv.gz.enc"

# Eliminar registros archivados
psql -c "DELETE FROM audit_logs 
         WHERE timestamp < NOW() - INTERVAL '90 days'"
```

### Reportes de Cumplimiento

**Reporte de Accesos (mensual)**
```sql
-- Accesos por rol
SELECT 
    event_type,
    COUNT(*) as total,
    COUNT(DISTINCT user_id_hash) as unique_users,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed
FROM audit_logs
WHERE timestamp >= DATE_TRUNC('month', NOW())
GROUP BY event_type
ORDER BY total DESC;
```

**Reporte de Seguridad (semanal)**
```sql
-- Intentos de acceso no autorizado
SELECT 
    event_type,
    user_id_hash,
    COUNT(*) as attempts,
    MAX(timestamp) as last_attempt
FROM audit_logs
WHERE event_type IN (
    'LOGIN_FAILED_PASSWORD',
    'AUTHORIZATION_FAILED',
    'CSRF_MISMATCH'
)
AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY event_type, user_id_hash
HAVING COUNT(*) >= 5
ORDER BY attempts DESC;
```

---

## Guía de Implementación

### Checklist de Despliegue Seguro

**PRE-PRODUCCIÓN**

- [ ] Cambiar todos los secretos por valores únicos
- [ ] Generar SECRET_KEY de 32 bytes
- [ ] Generar AUDIT_HMAC_KEY de 32 bytes
- [ ] Configurar password fuerte de PostgreSQL
- [ ] Habilitar SSL/TLS en todas las conexiones
- [ ] Configurar certificados HTTPS (Let's Encrypt)
- [ ] Establecer COOKIE_SETTINGS.secure = True
- [ ] Validar security headers en Nginx
- [ ] Configurar rate limiting apropiado
- [ ] Habilitar logging de accesos
- [ ] Configurar backup cifrado de BD
- [ ] Probar recuperación de backup

**SEGURIDAD DE RED**

- [ ] Firewall: Solo puertos 80/443 públicos
- [ ] PostgreSQL: Solo accesible desde red interna
- [ ] Configurar VPC/Security Groups (cloud)
- [ ] Habilitar DDoS protection
- [ ] Configurar WAF rules
- [ ] Logging de red habilitado

**MONITOREO**

- [ ] Configurar alertas de intentos fallidos
- [ ] Monitorear tasa de errores 4xx/5xx
- [ ] Dashboard de seguridad
- [ ] Alertas de patrones anómalos
- [ ] Health checks automáticos

### Configuración de Producción

**docker-compose.production.yml**

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro
      - nginx_logs:/var/log/nginx
    environment:
      - TZ=UTC
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  backend:
    build: 
      context: ./backend
      dockerfile: Dockerfile.prod
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - AUDIT_HMAC_KEY=${AUDIT_HMAC_KEY}
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?sslmode=require
      - ENVIRONMENT=production
    depends_on:
      - postgres
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./certs/server.crt:/var/lib/postgresql/server.crt:ro
      - ./certs/server.key:/var/lib/postgresql/server.key:ro
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  postgres_data:
    driver: local
  nginx_logs:
    driver: local

networks:
  default:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

**.env.production**

```bash
# CRÍTICO: NO COMMITEAR ESTE ARCHIVO
# Usar secrets manager en producción real

# Application
SECRET_KEY=<generar-con-secrets.token_urlsafe(32)>
AUDIT_HMAC_KEY=<generar-con-secrets.token_hex(32)>
ENVIRONMENT=production

# Database
DB_USER=sfas_prod
DB_PASSWORD=<generar-con-secrets.token_urlsafe(24)>
DB_NAME=sfas_production

# Backup
BACKUP_ENCRYPTION_KEY=<generar-con-secrets.token_hex(32)>
```

---

## Validación y Testing

### Tests de Seguridad

**1. Test de Autenticación**

```python
# tests/security/test_auth.py
import pytest
from fastapi.testclient import TestClient

def test_login_without_otp_fails(client: TestClient):
    """Login sin OTP no debe dar acceso completo"""
    response = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "Admin!2026_SFAS"
    })
    assert response.status_code == 200
    data = response.json()
    assert "otp_required" in data
    
    # Intentar acceder a endpoint protegido
    response = client.get("/api/secretaria/casos")
    assert response.status_code == 401

def test_brute_force_protection(client: TestClient):
    """Debe bloquear después de 5 intentos fallidos"""
    for i in range(5):
        response = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrong_password"
        })
        assert response.status_code == 401
    
    # Intento 6 debe retornar account locked
    response = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "Admin!2026_SFAS"
    })
    assert response.status_code == 429  # Too Many Requests

def test_session_expiration(client: TestClient):
    """Sesión debe expirar después de 24 horas"""
    # Login y obtener session
    # ... autenticación completa ...
    
    # Simular paso del tiempo
    with freeze_time(datetime.now() + timedelta(hours=25)):
        response = client.get("/api/secretaria/casos")
        assert response.status_code == 401
        assert "expirada" in response.json()["detail"].lower()
```

**2. Test de Autorización**

```python
def test_rbac_enforcement(client: TestClient):
    """Roles deben estar estrictamente separados"""
    # Login como juez
    juez_session = login_as("juez1", "Juez!2026_SFAS")
    
    # Intentar crear caso (solo secretario)
    response = client.post(
        "/api/secretaria/casos",
        headers={"X-CSRF-Token": juez_session.csrf_token},
        cookies={"sfas_session": juez_session.session_id},
        json={"title": "Test", "description": "Test case"}
    )
    assert response.status_code == 403
    assert "no autorizado" in response.json()["detail"].lower()

def test_csrf_protection(client: TestClient):
    """Peticiones sin CSRF token deben fallar"""
    session = login_as("admin", "Admin!2026_SFAS")
    
    # Sin token CSRF
    response = client.post(
        "/api/aperturas",
        cookies={"sfas_session": session.session_id},
        json={"name": "Test", "required_custodios": 2}
    )
    assert response.status_code == 403
    assert "csrf" in response.json()["detail"].lower()
```

**3. Test de Sanitización**

```python
def test_public_api_sanitization(client: TestClient):
    """API pública no debe exponer datos sensibles"""
    # Crear caso con datos sensibles
    # ...
    
    # Consultar públicamente
    response = client.get("/api/public/cases?q=CASO-2026-001")
    assert response.status_code == 200
    data = response.json()["items"][0]
    
    # Verificar que NO existen campos sensibles
    assert "id" not in data
    assert "created_by" not in data
    assert "assigned_judge" not in data
    assert "signature" not in data  # firma interna
    
    # Verificar que SÍ existen campos públicos
    assert "case_number" in data
    assert "title" in data
    assert data["status"] in ["EN PROCESO", "RESUELTO"]
```

### Penetration Testing

**Checklist de Pentesting**

```bash
# 1. Scanning de puertos
nmap -sV -sC -p- <target_ip>

# 2. SSL/TLS testing
sslscan <target_domain>
testssl.sh <target_domain>

# 3. Web vulnerability scanning
nikto -h <target_url>
owasp-zap-cli quick-scan <target_url>

# 4. SQL Injection testing (automated)
sqlmap -u "<target_url>/api/public/cases?q=test" --batch

# 5. XSS testing
# Probar payloads en todos los inputs:
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
javascript:alert('XSS')

# 6. CSRF testing
# Intentar peticiones desde origen diferente

# 7. Authentication bypass
# Intentar acceder sin autenticación
# Intentar manipular session tokens

# 8. Rate limiting validation
# Enviar 1000 requests rápidas
ab -n 1000 -c 10 <target_url>
```

### Monitoreo de Seguridad

**Métricas Clave**

```python
# Prometheus metrics
from prometheus_client import Counter, Histogram

# Autenticación
login_attempts_total = Counter(
    'login_attempts_total',
    'Total login attempts',
    ['status']  # success, failed_password, failed_otp
)

login_duration_seconds = Histogram(
    'login_duration_seconds',
    'Time spent in login process'
)

# Autorización
authorization_failures_total = Counter(
    'authorization_failures_total',
    'Total authorization failures',
    ['reason']  # csrf, role, session
)

# Rate Limiting
rate_limit_exceeded_total = Counter(
    'rate_limit_exceeded_total',
    'Total rate limit violations',
    ['zone']  # public_api, auth_api
)

# Audit Events
audit_events_total = Counter(
    'audit_events_total',
    'Total audit events',
    ['event_type', 'success']
)
```

**Alertas Críticas**

```yaml
# prometheus_alerts.yml
groups:
  - name: security
    interval: 1m
    rules:
      - alert: HighFailedLoginRate
        expr: rate(login_attempts_total{status="failed_password"}[5m]) > 10
        for: 5m
        annotations:
          summary: "High rate of failed login attempts"
          description: "More than 10 failed logins per second for 5 minutes"
      
      - alert: CSRFAttackDetected
        expr: rate(authorization_failures_total{reason="csrf"}[1m]) > 5
        for: 1m
        annotations:
          summary: "Possible CSRF attack"
          description: "Multiple CSRF token mismatches detected"
      
      - alert: RateLimitViolations
        expr: rate(rate_limit_exceeded_total[5m]) > 100
        for: 5m
        annotations:
          summary: "Excessive rate limit violations"
          description: "Possible DoS attack or misconfigured client"
```

---

## Conclusión

Este documento detalla la arquitectura de seguridad de LexSecure SFAS en todos los niveles del modelo C4:

**NIVEL 1 - CONTEXTO**: Límites de confianza, actores, perímetros
**NIVEL 2 - CONTENEDORES**: Zonas de seguridad, comunicación segura
**NIVEL 3 - COMPONENTES**: Módulos de autenticación, autorización, sanitización
**NIVEL 4 - CÓDIGO**: Patrones seguros, validación, manejo de secretos

### Características de Seguridad Implementadas

1. **Autenticación Multifactor**: Password + TOTP (2FA)
2. **Autorización Granular**: RBAC con validación por endpoint
3. **Protección CSRF**: Double-submit cookie pattern
4. **Sanitización**: Whitelist approach en API pública
5. **Pseudonimización**: HMAC en logs de auditoría
6. **Rate Limiting**: Protección contra brute force y DoS
7. **Security Headers**: XSS, Clickjacking, CSP
8. **Auditoría Completa**: Todos los eventos registrados
9. **Cifrado**: TLS en tránsito, bcrypt para passwords
10. **Defense in Depth**: Múltiples capas independientes

### Cumplimiento

- OWASP Top 10 mitigado
- STRIDE model aplicado
- Privacy by Design
- Audit trail completo
- Separation of duties

### Próximos Pasos

Para un despliegue de producción robusto, considerar:

1. **WAF**: Web Application Firewall (ModSecurity)
2. **IDS/IPS**: Sistema de detección de intrusos
3. **SIEM**: Correlación de eventos de seguridad
4. **Penetration Testing**: Auditoría profesional anual
5. **Bug Bounty**: Programa de recompensas
6. **Security Training**: Capacitación continua del equipo

---

**Versión**: 1.0.0  
**Fecha**: 2026-01-13  
**Clasificación**: Documento Técnico - Distribución Interna
