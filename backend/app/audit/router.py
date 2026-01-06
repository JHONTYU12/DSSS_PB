from fastapi import APIRouter, Depends
from ..rbac.deps import require_roles_csrf
from ..db.session import SessionLocal
from ..db import models

router = APIRouter(prefix="/auditoria", tags=["auditoria"])

@router.get("/logs")
def get_logs(ctx=Depends(require_roles_csrf("auditor"))):
    """
    Devuelve logs de auditoría ANONIMIZADOS para el auditor.
    
    El auditor ve:
    - Pseudónimos (actor_pseudo, target_pseudo) para correlación
    - Rol genérico (juez, secretario, etc.) sin identificar a la persona
    - Acción realizada
    - Timestamp
    - Éxito/fracaso
    - IP parcialmente enmascarada
    - Details redactados (sin case_id, user_id, etc.)
    
    NO ve:
    - Nombres de usuario reales
    - IDs de casos reales
    - IDs de resoluciones reales
    - IPs completas
    
    Esto permite auditar el sistema sin comprometer el anonimato juez-caso.
    """
    s, u = ctx
    db = SessionLocal()
    try:
        items = db.query(models.AuditEvent).order_by(models.AuditEvent.id.desc()).limit(200).all()
        return [{
            "id": e.id,
            "ts": e.ts.isoformat(),
            "actor_ref": e.actor_pseudo,      # Pseudónimo, NO el nombre real
            "role": e.role,                    # Rol genérico
            "action": e.action,
            "target_ref": e.target_pseudo,    # Pseudónimo, NO el ID real
            "ip": e.ip,                        # Ya viene enmascarada desde logger
            "success": e.success,
            "details": e.details,              # Ya viene redactado desde logger
        } for e in items]
    finally:
        db.close()

@router.get("/stats")
def get_stats(ctx=Depends(require_roles_csrf("auditor"))):
    """
    Estadísticas agregadas de auditoría (no revelan información individual).
    """
    s, u = ctx
    db = SessionLocal()
    try:
        from sqlalchemy import func
        
        # Conteo por acción
        action_counts = db.query(
            models.AuditEvent.action,
            func.count(models.AuditEvent.id)
        ).group_by(models.AuditEvent.action).all()
        
        # Conteo por rol
        role_counts = db.query(
            models.AuditEvent.role,
            func.count(models.AuditEvent.id)
        ).group_by(models.AuditEvent.role).all()
        
        # Éxitos vs fracasos
        success_counts = db.query(
            models.AuditEvent.success,
            func.count(models.AuditEvent.id)
        ).group_by(models.AuditEvent.success).all()
        
        return {
            "by_action": {a: c for a, c in action_counts},
            "by_role": {r or "unknown": c for r, c in role_counts},
            "by_success": {"success": 0, "failure": 0, **{str(s): c for s, c in success_counts}},
            "total_events": db.query(func.count(models.AuditEvent.id)).scalar()
        }
    finally:
        db.close()
        db.close()
