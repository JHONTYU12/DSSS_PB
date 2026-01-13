from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
import secrets
from ..rbac.deps import require_roles
from ..db.session import SessionSecretaria, SessionJueces, SessionIdentidad  # Múltiples BDs
from ..db import models
from ..audit.logger import log_event

router = APIRouter(prefix="/aperturas", tags=["aperturas"])

# Configuración de seguridad para vista temporal
VIEW_TOKEN_EXPIRY_SECONDS = 120  # 2 minutos

class OpeningCreate(BaseModel):
    case_id: int
    reason: str = Field(min_length=10, max_length=2000)
    m_required: int = Field(default=2, ge=1, le=5)

@router.post("/solicitudes")
def create_request(payload: OpeningCreate, request: Request, user: dict = Depends(require_roles("admin"))):
    """Crear solicitud de apertura M-de-N (solo admin)"""
    db_secretaria = SessionSecretaria()  # Para verificar caso
    db_jueces = SessionJueces()  # Para crear solicitud de apertura
    try:
        c = db_secretaria.query(models.Case).filter(models.Case.id == payload.case_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Case not found")
        req = models.OpeningRequest(case_id=c.id, reason=payload.reason, m_required=payload.m_required, created_by=user["user_id"], status="PENDING")
        db_jueces.add(req)
        db_jueces.commit()
        db_jueces.refresh(req)

        log_event(actor=user["username"], role=user["role"], action="OPENING_CREATE", target=f"opening:{req.id}", ip=request.client.host if request.client else None,
                  success=True, details={"case_id": c.id, "m_required": payload.m_required})
        return {"request_id": req.id, "status": req.status, "m_required": req.m_required}
    finally:
        db_secretaria.close()
        db_jueces.close()

@router.get("/solicitudes")
def list_requests(user: dict = Depends(require_roles("admin", "custodio"))):
    """Listar solicitudes de apertura (admin y custodios)"""
    db = SessionJueces()  # Aperturas están en BD Jueces
    try:
        reqs = db.query(models.OpeningRequest).order_by(models.OpeningRequest.id.desc()).limit(50).all()
        result = []
        for r in reqs:
            # Count current approvals
            approvals = db.query(models.OpeningApproval).filter(
                models.OpeningApproval.request_id == r.id,
                models.OpeningApproval.decision == "APPROVE"
            ).count()
            result.append({
                "id": r.id, 
                "case_id": r.case_id, 
                "status": r.status, 
                "m_required": r.m_required,
                "approvals": approvals
            })
        return result
    finally:
        db.close()

class ApprovalReq(BaseModel):
    decision: str = Field(default="APPROVE", pattern="^(APPROVE|REJECT)$")

@router.post("/solicitudes/{request_id}/aprobar")
def approve_request(request_id: int, payload: ApprovalReq, request: Request, user: dict = Depends(require_roles("custodio"))):
    """Aprobar o rechazar solicitud de apertura (solo custodios)"""
    db = SessionJueces()  # Aperturas y aprobaciones en BD Jueces
    try:
        req = db.query(models.OpeningRequest).filter(models.OpeningRequest.id == request_id).first()
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")

        # Prevent duplicate approvals by same custodian
        existing = db.query(models.OpeningApproval).filter(
            models.OpeningApproval.request_id == request_id,
            models.OpeningApproval.custodian_id == user["user_id"]
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Already voted")

        db.add(models.OpeningApproval(request_id=request_id, custodian_id=user["user_id"], decision=payload.decision))
        db.commit()

        # Recompute threshold
        approvals = db.query(models.OpeningApproval).filter(
            models.OpeningApproval.request_id == request_id,
            models.OpeningApproval.decision == "APPROVE"
        ).count()

        if approvals >= req.m_required:
            req.status = "APPROVED_M_REACHED"
            db.commit()

        log_event(actor=user["username"], role=user["role"], action="OPENING_APPROVAL", target=f"opening:{request_id}", ip=request.client.host if request.client else None,
                  success=True, details={"decision": payload.decision, "approvals": approvals})
        return {"request_id": request_id, "status": req.status, "approvals": approvals, "m_required": req.m_required}
    finally:
        db.close()


# ============================================
# SECURE ONE-TIME VIEW ENDPOINTS (Auditor)
# ============================================

@router.get("/aprobadas")
def list_approved_openings(user: dict = Depends(require_roles("auditor"))):
    """List approved openings that haven't been viewed yet (for auditor)"""
    db_jueces = SessionJueces()  # Aperturas en BD Jueces
    db_secretaria = SessionSecretaria()  # Casos en BD Secretaría
    try:
        # Only show approved openings that haven't been viewed
        reqs = db_jueces.query(models.OpeningRequest).filter(
            models.OpeningRequest.status == "APPROVED_M_REACHED",
            models.OpeningRequest.viewed_at == None
        ).order_by(models.OpeningRequest.created_at.desc()).all()
        
        result = []
        for r in reqs:
            case = db_secretaria.query(models.Case).filter(models.Case.id == r.case_id).first()
            result.append({
                "id": r.id,
                "case_id": r.case_id,
                "case_number": case.case_number if case else "—",
                "reason": r.reason[:100] + "..." if len(r.reason) > 100 else r.reason,
                "m_required": r.m_required,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return result
    finally:
        db_jueces.close()
        db_secretaria.close()


@router.post("/solicitar-vista/{request_id}")
def request_secure_view(request_id: int, request: Request, user: dict = Depends(require_roles("auditor"))):
    """
    Generate a one-time secure view token for an approved opening.
    Security: Token is valid for 2 minutes and can only be used once.
    """
    db = SessionJueces()  # Aperturas en BD Jueces
    try:
        req = db.query(models.OpeningRequest).filter(models.OpeningRequest.id == request_id).first()
        if not req:
            raise HTTPException(status_code=404, detail="Opening request not found")
        
        if req.status != "APPROVED_M_REACHED":
            raise HTTPException(status_code=400, detail="Opening not approved yet")
        
        if req.viewed_at is not None:
            raise HTTPException(status_code=410, detail="This opening has already been viewed and is no longer accessible")
        
        # Check if there's an existing unexpired token
        if req.view_token and req.view_token_expires:
            if req.view_token_expires > datetime.now(timezone.utc):
                # Return existing token with remaining time
                remaining = (req.view_token_expires - datetime.now(timezone.utc)).total_seconds()
                return {
                    "token": req.view_token,
                    "expires_in_seconds": int(remaining),
                    "message": "Token already generated, use existing token"
                }
        
        # Generate new secure token
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(seconds=VIEW_TOKEN_EXPIRY_SECONDS)
        
        req.view_token = token
        req.view_token_expires = expires
        db.commit()
        
        log_event(
            actor=user["username"], role=user["role"], action="OPENING_VIEW_TOKEN_GENERATED",
            target=f"opening:{request_id}", ip=request.client.host if request.client else None,
            success=True, details={"token_expires": expires.isoformat()}
        )
        
        return {
            "token": token,
            "expires_in_seconds": VIEW_TOKEN_EXPIRY_SECONDS,
            "message": "Use this token to view sensitive case information. Token expires in 2 minutes."
        }
    finally:
        db.close()


@router.post("/ver-seguro/{request_id}")
def view_secure_opening(request_id: int, token: str, request: Request, user: dict = Depends(require_roles("auditor"))):
    """
    View the sensitive information of an approved opening using the secure token.
    Security: One-time view only. After viewing, information is no longer accessible.
    """
    db_jueces = SessionJueces()  # Aperturas y resoluciones
    db_secretaria = SessionSecretaria()  # Casos
    db_identidad = SessionIdentidad()  # Usuarios
    try:
        req = db_jueces.query(models.OpeningRequest).filter(models.OpeningRequest.id == request_id).first()
        if not req:
            raise HTTPException(status_code=404, detail="Opening request not found")
        
        # Security checks
        if req.viewed_at is not None:
            log_event(
                actor=user["username"], role=user["role"], action="OPENING_VIEW_DENIED",
                target=f"opening:{request_id}", ip=request.client.host if request.client else None,
                success=False, details={"reason": "Already viewed"}
            )
            raise HTTPException(status_code=410, detail="This opening has already been viewed")
        
        if not req.view_token or req.view_token != token:
            log_event(
                actor=user["username"], role=user["role"], action="OPENING_VIEW_DENIED",
                target=f"opening:{request_id}", ip=request.client.host if request.client else None,
                success=False, details={"reason": "Invalid token"}
            )
            raise HTTPException(status_code=403, detail="Invalid or expired token")
        
        if not req.view_token_expires or req.view_token_expires < datetime.now(timezone.utc):
            log_event(
                actor=user["username"], role=user["role"], action="OPENING_VIEW_DENIED",
                target=f"opening:{request_id}", ip=request.client.host if request.client else None,
                success=False, details={"reason": "Token expired"}
            )
            raise HTTPException(status_code=403, detail="Token has expired. Request a new token.")
        
        # Get case and judge information (desde BD Secretaría e Identidad)
        case = db_secretaria.query(models.Case).filter(models.Case.id == req.case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        judge = None
        if case.assigned_judge:
            judge = db_identidad.query(models.User).filter(models.User.id == case.assigned_judge).first()
        
        # Get resolutions for this case (desde BD Jueces)
        resolutions = db_jueces.query(models.Resolution).filter(models.Resolution.case_id == case.id).all()
        
        # Get custodian approvals (desde BD Jueces e Identidad)
        approvals = db_jueces.query(models.OpeningApproval).filter(
            models.OpeningApproval.request_id == request_id,
            models.OpeningApproval.decision == "APPROVE"
        ).all()
        custodian_names = []
        for a in approvals:
            cust = db_identidad.query(models.User).filter(models.User.id == a.custodian_id).first()
            if cust:
                custodian_names.append(cust.username)
        
        # Mark as viewed (ONE-TIME VIEW)
        req.viewed_at = datetime.now(timezone.utc)
        req.viewed_by = user["user_id"]
        req.view_token = None  # Invalidate token
        req.view_token_expires = None
        db_jueces.commit()
        
        log_event(
            actor=user["username"], role=user["role"], action="OPENING_VIEWED",
            target=f"opening:{request_id}", ip=request.client.host if request.client else None,
            success=True, details={"case_id": case.id, "viewed_sensitive_info": True}
        )
        
        return {
            "opening_id": req.id,
            "reason": req.reason,
            "viewed_at": req.viewed_at.isoformat(),
            "case": {
                "id": case.id,
                "case_number": case.case_number,
                "title": case.title,
                "parties": case.parties,
                "status": case.status,
                "created_at": case.created_at.isoformat() if case.created_at else None
            },
            "judge": {
                "username": judge.username if judge else None,
                "role": judge.role if judge else None
            } if judge else None,
            "resolutions": [
                {
                    "id": r.id,
                    "content": r.content,
                    "status": r.status,
                    "signed_at": r.signed_at.isoformat() if r.signed_at else None,
                    "doc_hash": r.doc_hash
                }
                for r in resolutions
            ],
            "custodian_approvals": custodian_names,
            "security_notice": "Esta informacion se tiene acceso una sola vez, luego no es accesible te estamos observando"
        }
    finally:
        db_jueces.close()
        db_secretaria.close()
        db_identidad.close()