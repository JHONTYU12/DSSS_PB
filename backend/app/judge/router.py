from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import hashlib
import secrets
from ..rbac.deps import require_roles_csrf
from ..db.session import SessionSecretaria, SessionJueces  # BD Secretaría + BD Jueces
from ..db import models
from ..audit.logger import log_event

router = APIRouter(prefix="/juez", tags=["juez"])

class ResolutionCreate(BaseModel):
    case_id: int
    content: str = Field(min_length=10, max_length=20000)

@router.get("/casos")
def my_cases(ctx=Depends(require_roles_csrf("juez"))):
    s, u = ctx
    db = SessionSecretaria()  # Casos están en BD Secretaría
    try:
        items = db.query(models.Case).filter(models.Case.assigned_judge == u.id).order_by(models.Case.id.desc()).all()
        return [{"id": c.id, "case_number": c.case_number, "title": c.title, "status": c.status} for c in items]
    finally:
        db.close()

@router.post("/resoluciones")
def create_resolution(payload: ResolutionCreate, request: Request, ctx=Depends(require_roles_csrf("juez"))):
    s, u = ctx
    db_secretaria = SessionSecretaria()  # Para verificar caso
    db_jueces = SessionJueces()  # Para crear resolución
    try:
        c = db_secretaria.query(models.Case).filter(models.Case.id == payload.case_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Case not found")
        if c.assigned_judge != u.id:
            raise HTTPException(status_code=403, detail="Case not assigned to this judge")

        r = models.Resolution(case_id=c.id, content=payload.content, created_by=u.id, status="DRAFT")
        db_jueces.add(r)
        db_jueces.commit()
        db_jueces.refresh(r)

        log_event(actor=u.username, role=u.role, action="RESOLUTION_CREATE", target=f"resolution:{r.id}", ip=request.client.host if request.client else None,
                  success=True, details={"case_id": c.id})
        return {"resolution_id": r.id, "case_id": c.id, "status": r.status}
    finally:
        db_secretaria.close()
        db_jueces.close()

@router.post("/resoluciones/{resolution_id}/firmar")
def sign_resolution(resolution_id: int, request: Request, ctx=Depends(require_roles_csrf("juez"))):
    s, u = ctx
    db_secretaria = SessionSecretaria()  # Para actualizar estado del caso
    db_jueces = SessionJueces()  # Para firmar resolución
    try:
        r = db_jueces.query(models.Resolution).filter(models.Resolution.id == resolution_id).first()
        if not r:
            raise HTTPException(status_code=404, detail="Resolution not found")
        if r.created_by != u.id:
            raise HTTPException(status_code=403, detail="Only author judge can sign this resolution")

        # Compute hash (evidence for ledger)
        h = hashlib.sha256(r.content.encode("utf-8")).hexdigest()
        # Mock "anonymous signature" (lab) - deterministic-ish token. In real impl: group signature service.
        sig = "GRP_SIG_" + secrets.token_hex(16)

        r.doc_hash = h
        r.signature = sig
        r.status = "SIGNED"
        r.signed_at = datetime.now(timezone.utc)
        db_jueces.commit()

        # Actualizar estado del caso en BD Secretaría
        c = db_secretaria.query(models.Case).filter(models.Case.id == r.case_id).first()
        if c:
            c.status = "RESOLUTION_SIGNED"
            db_secretaria.commit()

        log_event(actor=u.username, role=u.role, action="RESOLUTION_SIGN", target=f"resolution:{r.id}", ip=request.client.host if request.client else None,
                  success=True, details={"hash": h, "sig": f"{sig[:12]}..."})
        # In future: publish to ledger; here we return evidence payload
        return {"resolution_id": r.id, "status": r.status, "hash": h, "signature": sig, "ledger_event": {"type":"RESOLUTION_SIGNED","ts": r.signed_at.isoformat()}}
    finally:
        db_secretaria.close()
        db_jueces.close()
