# LexSecure SFAS — Sistema Judicial Seguro

<!-- Badges: se mantienen en una sola línea para mejor render -->
[![Sistema](https://img.shields.io/badge/LexSecure%20SFAS-2563eb?style=for-the-badge&logo=github&logoColor=white)](https://github.com/JHONTYU12/DSSS_PB) [![Estado](https://img.shields.io/badge/Estado-Completo-success?style=for-the-badge&logo=check-circle&logoColor=white)]() [![Versión](https://img.shields.io/badge/Versión-1.2-blue?style=for-the-badge&logo=semver&logoColor=white)]()

## Demo en Video

[![▶ Ver Demo: LexSecure SFAS](https://img.youtube.com/vi/vjgBdObsVW8/hqdefault.jpg)](https://www.youtube.com/watch?v=vjgBdObsVW8)

*Haz click en la miniatura para reproducir el video en YouTube (mejor compatibilidad en GitHub).* 

**Demostración completa del sistema:** vista pública, autenticación 2FA, gestión interna y auditoría.

**Contenido del video:**
- Vista pública de casos
- Autenticación 2FA con Google Authenticator
- Gestión de casos por secretarios
- Creación y firma de resoluciones por jueces
- Sistema de aperturas M-of-N
- Auditoría con pseudónimos y privacidad

**Duración:** ~2 minutos

---

## ¿Qué es LexSecure SFAS?

**LexSecure SFAS** es un sistema judicial moderno y seguro diseñado para gestionar casos legales con el más alto nivel de confidencialidad y auditabilidad. Combina tecnología de vanguardia con principios de seguridad avanzados para garantizar que cada acción sea rastreable mientras protege la privacidad de todos los involucrados.

### Características Principales

**Autenticación de Doble Factor (2FA)**  
Acceso seguro con contraseña + código TOTP generado por aplicaciones como Google Authenticator.

**Control de Acceso Basado en Roles (RBAC)**  
Cada usuario tiene permisos específicos: Secretarios, Jueces, Administradores, Custodios y Auditores.

**Consulta Pública Segura**  
Los ciudadanos pueden buscar casos sin necesidad de registro, viendo solo información autorizada.

**Firmas Digitales Verificables**  
Resoluciones firmadas con hash SHA256 para verificación pública de autenticidad.

**Sistema M-of-N para Aperturas**  
Aperturas controladas que requieren aprobación de múltiples custodios.

**Auditoría Completa con Pseudónimos**  
Todos los eventos se registran con protección de privacidad usando pseudónimos HMAC.

**Defensa en Profundidad**  
Múltiples capas de seguridad: rate limiting, headers de seguridad, protección CSRF, sanitización de datos.

---

## Instalación Rápida

### Prerrequisitos
- Docker y Docker Compose
- Puerto 80 disponible

### Pasos

```bash
# 1. Clonar o navegar al directorio del proyecto
cd /ruta/al/proyecto/final

# 2. Levantar todos los servicios
docker compose up -d --build

# 3. Acceder al sistema
# Vista Pública: http://localhost
# Acceso Personal: Hacer clic en "Acceso Personal"
```

¡Eso es todo! El sistema estará funcionando en segundos.

---

## Usuarios de Demostración

Para probar todas las funcionalidades, usa estas credenciales:

| Usuario | Contraseña | Rol | Descripción |
|---------|------------|-----|-------------|
| `admin` | `Admin!2026_SFAS` | Administrador | Gestión de aperturas |
| `juez1` | `Juez!2026_SFAS` | Juez | Crear y firmar resoluciones |
| `secret1` | `Secret!2026_SFAS` | Secretario | Crear y asignar casos |
| `cust1` | `Cust!2026_SFAS` | Custodio | Aprobar aperturas |
| `cust2` | `Cust!2026_SFAS` | Custodio | Aprobar aperturas |
| `audit1` | `Audit!2026_SFAS` | Auditor | Consultar logs |

### 🔑Configuración 2FA

**Secrets TOTP de los usuarios demo:**

| Usuario | Contraseña | Rol | Secret TOTP (Google Authenticator) |
|---------|------------|-----|-------------------------------------|
| `admin` | `Admin!2026_SFAS` | Administrador | `IMPZMWM2LZRT7634WHP3II3NTYCKYQAA` |
| `juez1` | `Juez!2026_SFAS` | Juez | `4UW6B7UPSVOUR33QQKSXOGWKOPW4JPF6` |
| `secret1` | `Secret!2026_SFAS` | Secretario | `RTBNNG2ILXO3NCSRXV45JMKE6QQTNGB7` |
| `cust1` | `Cust!2026_SFAS` | Custodio | `LWFOGZABWSW4LE4G3Y7SME4S7TYSFZGP` |
| `cust2` | `Cust!2026_SFAS` | Custodio | `AJ5SW5OEILNTKAD4GIG533ZGF4B7JMAZ` |
| `audit1` | `Audit!2026_SFAS` | Auditor | `DAA35TWEE347OE4XIRF2ECZZDMINJ627` |

**Pasos para configurar Google Authenticator:**
1. Abre la app en tu teléfono
2. Toca **+** → **Introducir clave de configuración**
3. **Nombre**: `SFAS-admin` (o el usuario que uses)
4. **Clave**: Copia el Secret TOTP de la tabla
5. **Tipo**: Basado en tiempo
6. Guarda y usa el código de 6 dígitos generado

---

##  Arquitectura del Sistema

```
 Usuario Público
    ↓
 Nginx (Reverse Proxy + Rate Limiting)
    ↓
├──  Frontend (React + Vite)
│   ├── Vista Pública de Casos
│   └── Dashboards por Rol
│
└── Backend (FastAPI + Python)
    ├── Autenticación 2FA
    ├── API por Roles
    ├── Auditoría con Pseudónimos
    └── Sanitización de Datos
        ↓
     PostgreSQL (Base de Datos)
        ├── Usuarios y Sesiones
        ├── Casos y Resoluciones
        ├── Aperturas M-of-N
        └── Logs de Auditoría
```

### Tecnologías Utilizadas
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.0
- **Frontend**: React 18, Vite
- **Base de Datos**: PostgreSQL 16
- **Autenticación**: PyOTP (TOTP), bcrypt
- **Contenedorización**: Docker Compose
- **Proxy**: Nginx con rate limiting y security headers

---

## Seguridad Implementada

### 🔐 Autenticación - JWT en Cookie HttpOnly
- ✅ **JWT firmado con HS256** (HMAC-SHA256) usando clave secreta de 32+ caracteres
- ✅ **Cookie HttpOnly `sfas_jwt`**: JavaScript NO puede leer el token (**inmune a XSS**)
- ✅ **Cookie `sfas_csrf`**: Token CSRF vinculado al JWT para validación
- ✅ **2FA obligatorio**: PyOTP con TOTP de 6 dígitos (30 segundos)
- ✅ **Contraseñas**: Hasheadas con bcrypt (factor 12)
- ✅ **Expiración**: 8 horas, renovable con refresh
- ✅ **Revocación**: Blacklist de tokens en logout

### 🛡️ Protección CSRF - Double-Submit Cookie Pattern
- ✅ Token CSRF único por sesión (campo `csrf` en payload del JWT)
- ✅ Cliente lee cookie `sfas_csrf` y lo envía en header `X-CSRF-Token`
- ✅ Backend valida: `jwt.payload.csrf == header[X-CSRF-Token]`
- ✅ Comparación con `secrets.compare_digest()` (protección timing-attack)
- ✅ Protección contra CSRF: Atacante en otro sitio no puede leer cookies del navegador

### 🎯 Autorización - RBAC (Control de Acceso Basado en Roles)
- ✅ Validación de roles en cada endpoint: `require_roles("admin", "juez")`
- ✅ JWT payload incluye: `user_id`, `username`, `role`, `csrf`, `exp`, `iat`, `jti`, `iss`, `aud`
- ✅ Administrador tiene acceso universal
- ✅ Endpoints públicos sin autenticación (búsqueda de casos)

### 🔒 Privacidad y Datos
- ✅ API pública: SOLO datos autorizados (sin nombres de jueces, solo pseudónimos)
- ✅ Auditoría con pseudónimos HMAC-SHA256
- ✅ Redacción automática de información confidencial en logs
- ✅ localStorage: **NO se usa para tokens** (eliminada vulnerabilidad XSS)

### 🏗️ Infraestructura
- ✅ Rate limiting: 10 req/s público, 5 req/min autenticación
- ✅ Security headers: CSP, X-Frame-Options, X-Content-Type-Options, HSTS
- ✅ Sanitización HTML en todas las entradas/salidas
- ✅ CORS configurado: `credentials: "include"` para cookies

---

## Flujo de Trabajo

1. **Consulta Pública** 
   - Ciudadanos buscan casos por número o término
   - Visualizan resoluciones firmadas
   - Verifican autenticidad con hash

2. **Gestión de Casos** 
   - Secretarios crean casos y los asignan a jueces
   - Jueces elaboran y firman resoluciones

3. **Aperturas Controladas** 
   - Administradores crean aperturas M-of-N
   - Custodios aprueban colectivamente

4. **Auditoría Continua** 
   - Todos los eventos se registran automáticamente
   - Auditores consultan logs con privacidad garantizada

---

## Casos de Uso

### Para Ciudadanos
- **Buscar casos**: Encuentra información sobre procesos judiciales
- **Verificar resoluciones**: Confirma la autenticidad de documentos
- **Acceso sin registro**: Consulta pública completamente anónima

### Para Personal Judicial
- **Secretarios**: Gestión eficiente de casos y asignaciones
- **Jueces**: Creación y firma digital de resoluciones
- **Custodios**: Control colectivo de aperturas sensibles
- **Auditores**: Monitoreo completo con protección de privacidad

---

##  Beneficios

 **Eficiencia**: Automatización de procesos judiciales  
**Seguridad**: Protección avanzada contra amenazas  
 **Transparencia**: Consulta pública con verificación  
 **Auditabilidad**: Rastreo completo de todas las acciones  
 **Privacidad**: Protección de datos sensibles  
**Rendimiento**: Arquitectura optimizada con Docker  

---

## 📚 Documentación Técnica

Para desarrolladores interesados en el código técnico, consultar:
- [README_Tecnico.md](README_Tecnico.md) - Documentación completa del sistema
- Arquitectura C4, diagramas ER, guías de código, configuración de seguridad

---

##  Contribuir

Este proyecto demuestra las mejores prácticas en:
- Seguridad de aplicaciones web
- Arquitectura de microservicios
- Protección de datos personales
- Desarrollo con contenedores

Para modificaciones o mejoras, revisar la documentación técnica completa.

---


*Versión 1.0.0 - Enero 2026*
