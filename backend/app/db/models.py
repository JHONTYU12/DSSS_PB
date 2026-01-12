"""
Modelos de datos del sistema SFAS según arquitectura C4.

Los modelos están organizados por la base de datos a la que pertenecen:

1. BD Identidades y Acceso (BaseIdentidad):
   - User: usuarios del sistema
   - Session: sesiones activas

2. BD Secretaría (BaseSecretaria):
   - Case: casos judiciales y expedientes

3. BD Jueces (BaseJueces):
   - Resolution: resoluciones judiciales
   - OpeningRequest: solicitudes de apertura M-de-N
   - OpeningApproval: aprobaciones de custodios

4. BD Auditoría (BaseAuditoria):
   - AuditEvent: eventos de seguridad y trazabilidad
"""

from sqlalchemy import String, DateTime, Boolean, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from .base import BaseIdentidad, BaseSecretaria, BaseJueces, BaseAuditoria


# ══════════════════════════════════════════════════════════════════════════════
# BD IDENTIDADES Y ACCESO
# Almacena: credenciales, roles, estado de cuentas, sesiones activas
# ══════════════════════════════════════════════════════════════════════════════

class User(BaseIdentidad):
    """
    Usuarios del sistema con autenticación MFA.
    
    Roles disponibles:
    - admin: Administrador del sistema
    - juez: Juez que firma resoluciones
    - secretario: Registra casos y expedientes
    - custodio: Aprueba aperturas M-de-N
    - auditor: Consulta logs de auditoría
    """
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), index=True)
    totp_secret: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc)
    )


class Session(BaseIdentidad):
    """
    Sesiones activas de usuarios autenticados.
    
    Incluye token CSRF para protección contra ataques CSRF.
    Las sesiones pueden ser revocadas manualmente o expiran automáticamente.
    """
    __tablename__ = "sessions"
    
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


# ══════════════════════════════════════════════════════════════════════════════
# BD SECRETARÍA
# Almacena: casos judiciales, expedientes administrativos
# ══════════════════════════════════════════════════════════════════════════════

class Case(BaseSecretaria):
    """
    Casos judiciales registrados por secretarios.
    
    Estados del caso:
    - CREATED: Caso creado, pendiente de asignación
    - ASSIGNED: Caso asignado a un juez
    - DRAFT_RESOLUTION: Juez está redactando resolución
    - RESOLUTION_SIGNED: Resolución firmada
    - CLOSED: Caso cerrado
    """
    __tablename__ = "cases"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    parties: Mapped[str] = mapped_column(Text)
    # Referencias a usuarios (por ID, sin FK ya que está en otra BD)
    created_by: Mapped[str] = mapped_column(String(36), index=True)
    assigned_judge: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="CREATED", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc)
    )


# ══════════════════════════════════════════════════════════════════════════════
# BD JUECES
# Almacena: resoluciones, estados de firma, aperturas M-de-N
# ══════════════════════════════════════════════════════════════════════════════

class Resolution(BaseJueces):
    """
    Resoluciones judiciales creadas y firmadas por jueces.
    
    La firma es anónima (firma grupal) para proteger la identidad del juez.
    El hash SHA256 permite verificación pública de autenticidad.
    """
    __tablename__ = "resolutions"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Referencia al caso (por ID, sin FK ya que está en BD Secretaría)
    case_id: Mapped[int] = mapped_column(Integer, index=True)
    content: Mapped[str] = mapped_column(Text)
    # Referencia al juez que creó (por ID, sin FK ya que está en BD Identidad)
    created_by: Mapped[str] = mapped_column(String(36), index=True)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    # Criptografía
    doc_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OpeningRequest(BaseJueces):
    """
    Solicitudes de apertura de documentos sellados (esquema M-de-N).
    
    Requiere M aprobaciones de N custodios para completarse.
    Incluye mecanismo de visualización única con token temporal.
    """
    __tablename__ = "opening_requests"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Referencia al caso (por ID, sin FK)
    case_id: Mapped[int] = mapped_column(Integer, index=True)
    reason: Mapped[str] = mapped_column(Text)
    m_required: Mapped[int] = mapped_column(Integer, default=2)
    status: Mapped[str] = mapped_column(String(30), default="PENDING", index=True)
    # Referencia al creador (por ID, sin FK)
    created_by: Mapped[str] = mapped_column(String(36), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc)
    )
    # Campos para visualización única segura
    view_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    view_token_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    viewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class OpeningApproval(BaseJueces):
    """
    Aprobaciones de custodios para solicitudes de apertura.
    
    Cada custodio puede aprobar o rechazar una solicitud.
    Se requieren M aprobaciones para completar la apertura.
    """
    __tablename__ = "opening_approvals"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(Integer, index=True)
    # Referencia al custodio (por ID, sin FK)
    custodian_id: Mapped[str] = mapped_column(String(36), index=True)
    decision: Mapped[str] = mapped_column(String(10), default="APPROVE")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc)
    )


# ══════════════════════════════════════════════════════════════════════════════
# BD LOGS Y AUDITORÍA
# Almacena: eventos de seguridad, acciones críticas, trazabilidad, grabaciones
# ══════════════════════════════════════════════════════════════════════════════

class AuditEvent(BaseAuditoria):
    """
    Eventos de auditoría para trazabilidad del sistema.
    
    Implementa pseudonimización con HMAC para permitir correlación
    de eventos sin revelar identidades reales a auditores.
    
    Los datos reales (actor, target) solo son accesibles en
    investigaciones forenses autorizadas.
    """
    __tablename__ = "audit_events"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        index=True
    )
    # Datos reales (acceso restringido - solo investigación forense)
    actor: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Pseudónimos HMAC (visibles para auditor - permite correlación sin revelar identidad)
    actor_pseudo: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    target_pseudo: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    # Metadatos seguros
    role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)


class SecurityRecording(BaseAuditoria):
    """
    Grabaciones de seguridad de video y audio durante acceso al sistema.
    
    Se activa automáticamente cuando un usuario accede al área segura.
    Las grabaciones son evidencia forense en caso de incidentes.
    """
    __tablename__ = "security_recordings"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Referencia al usuario (por ID)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    username: Mapped[str] = mapped_column(String(50), index=True)
    role: Mapped[str] = mapped_column(String(20))
    # Metadatos de sesión
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Datos de grabación
    recording_type: Mapped[str] = mapped_column(String(20))  # 'video', 'audio', 'both'
    mime_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    # Archivo binario (blob)
    recording_data: Mapped[bytes] = mapped_column(Text)  # Base64 encoded
    # Timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc)
    )
    # Hash para verificación de integridad
    sha256_hash: Mapped[str] = mapped_column(String(64))

