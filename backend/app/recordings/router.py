"""
Router para grabaciones de seguridad del sistema SFAS.

Las grabaciones de video/audio se almacenan en la BD de Auditoría
como evidencia forense durante el acceso al área segura.
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional
import hashlib
import base64

from ..db.session import SessionAuditoria
from ..db import models
from ..rbac.deps import require_session
from ..audit.logger import log_event

router = APIRouter(prefix="/recordings", tags=["recordings"])


class RecordingUpload(BaseModel):
    recording_type: str = Field(..., pattern="^(video|audio|both)$")
    mime_type: str
    duration_seconds: int
    started_at: str  # ISO format
    ended_at: str    # ISO format
    recording_data: str  # Base64 encoded


class RecordingInfo(BaseModel):
    id: int
    user_id: str
    username: str
    role: str
    recording_type: str
    mime_type: str
    file_size: int
    duration_seconds: int
    started_at: datetime
    ended_at: datetime
    uploaded_at: datetime
    sha256_hash: str


@router.post("/upload")
async def upload_recording(
    data: RecordingUpload,
    request: Request,
    session_data: dict = Depends(require_session)
):
    """
    Sube una grabación de seguridad (video/audio) durante el acceso seguro.
    
    Las grabaciones son evidencia forense y se almacenan en la BD de Auditoría.
    """
    db = SessionAuditoria()
    try:
        # Calcular hash SHA256 de los datos
        recording_bytes = data.recording_data.encode('utf-8')
        sha256_hash = hashlib.sha256(recording_bytes).hexdigest()
        file_size = len(recording_bytes)
        
        # Parsear timestamps
        started_at = datetime.fromisoformat(data.started_at.replace('Z', '+00:00'))
        ended_at = datetime.fromisoformat(data.ended_at.replace('Z', '+00:00'))
        
        # Crear registro
        recording = models.SecurityRecording(
            user_id=session_data["user_id"],
            username=session_data["username"],
            role=session_data["role"],
            session_id=session_data["session_id"],
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent", "")[:500],
            recording_type=data.recording_type,
            mime_type=data.mime_type,
            file_size=file_size,
            duration_seconds=data.duration_seconds,
            recording_data=data.recording_data,
            started_at=started_at,
            ended_at=ended_at,
            sha256_hash=sha256_hash
        )
        db.add(recording)
        db.commit()
        db.refresh(recording)
        
        log_event(
            actor=session_data["username"],
            role=session_data["role"],
            action="SECURITY_RECORDING_UPLOADED",
            ip=request.client.host if request.client else None,
            success=True,
            details={"type": data.recording_type, "duration_seconds": data.duration_seconds, "size_bytes": file_size}
        )
        
        return {
            "success": True,
            "recording_id": recording.id,
            "sha256_hash": sha256_hash,
            "file_size": file_size
        }
    except Exception as e:
        log_event(
            actor=session_data.get("username"),
            role=session_data.get("role"),
            action="SECURITY_RECORDING_UPLOAD_FAILED",
            ip=request.client.host if request.client else None,
            success=False,
            details={"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=f"Error al guardar grabación: {str(e)}")
    finally:
        db.close()


@router.get("/list")
async def list_recordings(
    request: Request,
    session_data: dict = Depends(require_session),
    limit: int = 50,
    offset: int = 0
):
    """
    Lista las grabaciones de seguridad.
    
    Solo admin y auditor pueden ver todas las grabaciones.
    Otros usuarios solo ven las suyas propias.
    """
    db = SessionAuditoria()
    try:
        query = db.query(models.SecurityRecording)
        
        # Solo admin y auditor pueden ver todas las grabaciones
        if session_data["role"] not in ["admin", "auditor"]:
            query = query.filter(models.SecurityRecording.user_id == session_data["user_id"])
        
        total = query.count()
        recordings = query.order_by(models.SecurityRecording.uploaded_at.desc())\
                         .offset(offset).limit(limit).all()
        
        return {
            "recordings": [
                {
                    "id": r.id,
                    "user_id": r.user_id,
                    "username": r.username,
                    "role": r.role,
                    "recording_type": r.recording_type,
                    "mime_type": r.mime_type,
                    "file_size": r.file_size,
                    "duration_seconds": r.duration_seconds,
                    "started_at": r.started_at.isoformat(),
                    "ended_at": r.ended_at.isoformat(),
                    "uploaded_at": r.uploaded_at.isoformat(),
                    "sha256_hash": r.sha256_hash,
                    "ip_address": r.ip_address
                }
                for r in recordings
            ],
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset
            }
        }
    finally:
        db.close()


@router.get("/{recording_id}")
async def get_recording(
    recording_id: int,
    request: Request,
    session_data: dict = Depends(require_session)
):
    """
    Obtiene una grabación específica con sus datos binarios.
    
    Solo admin y auditor pueden ver grabaciones de otros usuarios.
    """
    db = SessionAuditoria()
    try:
        recording = db.query(models.SecurityRecording)\
                     .filter(models.SecurityRecording.id == recording_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Grabación no encontrada")
        
        # Verificar permisos
        if session_data["role"] not in ["admin", "auditor"]:
            if recording.user_id != session_data["user_id"]:
                raise HTTPException(status_code=403, detail="No tienes permiso para ver esta grabación")
        
        log_event(
            actor=session_data["username"],
            role=session_data["role"],
            action="SECURITY_RECORDING_VIEWED",
            target=f"recording_{recording_id}",
            ip=request.client.host if request.client else None,
            success=True,
            details={"viewed_user": recording.username}
        )
        
        return {
            "id": recording.id,
            "user_id": recording.user_id,
            "username": recording.username,
            "role": recording.role,
            "session_id": recording.session_id,
            "ip_address": recording.ip_address,
            "user_agent": recording.user_agent,
            "recording_type": recording.recording_type,
            "mime_type": recording.mime_type,
            "file_size": recording.file_size,
            "duration_seconds": recording.duration_seconds,
            "started_at": recording.started_at.isoformat(),
            "ended_at": recording.ended_at.isoformat(),
            "uploaded_at": recording.uploaded_at.isoformat(),
            "sha256_hash": recording.sha256_hash,
            "recording_data": recording.recording_data
        }
    finally:
        db.close()


@router.delete("/{recording_id}")
async def delete_recording(
    recording_id: int,
    request: Request,
    session_data: dict = Depends(require_session)
):
    """
    Elimina una grabación (solo admin).
    """
    if session_data["role"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar grabaciones")
    
    db = SessionAuditoria()
    try:
        recording = db.query(models.SecurityRecording)\
                     .filter(models.SecurityRecording.id == recording_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Grabación no encontrada")
        
        username = recording.username
        db.delete(recording)
        db.commit()
        
        log_event(
            actor=session_data["username"],
            role=session_data["role"],
            action="SECURITY_RECORDING_DELETED",
            target=f"recording_{recording_id}",
            ip=request.client.host if request.client else None,
            success=True,
            details={"deleted_user": username}
        )
        
        return {"success": True, "message": "Grabación eliminada"}
    finally:
        db.close()
