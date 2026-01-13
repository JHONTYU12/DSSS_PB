# LexSecure SFAS - Sistema Judicial Seguro

[![Sistema LexSecure SFAS](https://img.shields.io/badge/Sistema-LexSecure%20SFAS-blue?style=for-the-badge&logo=security)](https://github.com/tu-usuario/lexsecure-sfas)
[![Estado](https://img.shields.io/badge/Estado-Completo-success?style=flat-square)]()

##  Demo en Video

<video width="100%" height="400" controls>
  <source src="https://raw.githubusercontent.com/JHONTYU12/DSSS_PB/main/utils/paso0_Secretario.mov" type="video/quicktime">
  Tu navegador no soporta el elemento de video.
  <a href="https://raw.githubusercontent.com/JHONTYU12/DSSS_PB/main/utils/paso0_Secretario.mov">Descargar video</a>
</video>

*Demostración completa del sistema: desde la vista pública hasta la gestión interna con autenticación 2FA.*

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

### ✨ Características Principales

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
Al iniciar sesión por primera vez, se generará un código QR. Escanéalo con:
- Google Authenticator
- Microsoft Authenticator
- Authy
- Cualquier app TOTP compatible

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

### Autenticación
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Códigos TOTP de 6 dígitos (30 segundos)
- ✅ Sesiones HttpOnly con expiración automática

### Autorización
- ✅ Control de acceso basado en roles
- ✅ Protección CSRF con tokens únicos
- ✅ Validación de permisos por endpoint

### Privacidad
- ✅ API pública sin exposición de datos sensibles
- ✅ Pseudónimos HMAC en logs de auditoría
- ✅ Redacción automática de información confidencial

### Infraestructura
- ✅ Rate limiting (10 req/s público, 5 req/min auth)
- ✅ Security headers (CSP, XSS, Clickjacking)
- ✅ Sanitización de todas las entradas/salidas

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
