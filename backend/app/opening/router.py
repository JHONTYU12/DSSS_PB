from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
from ..rbac.deps import require_roles_csrf
from ..db.session import SessionLocal
from ..db import models
from ..audit.logger import log_event

router = APIRouter(prefix="/aperturas", tags=["aperturas"])

class OpeningCreate(BaseModel):
    case_id: int
    reason: str = Field(min_length=10, max_length=2000)
    m_required: int = Field(default=2, ge=1, le=5)

@router.post("/solicitudes")
def create_request(payload: OpeningCreate, request: Request, ctx=Depends(require_roles_csrf("admin"))):
    s, u = ctx
    db = SessionLocal()
    try:
        c = db.query(models.Case).filter(models.Case.id == payload.case_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Case not found")
        req = models.OpeningRequest(case_id=c.id, reason=payload.reason, m_required=payload.m_required, created_by=u.id, status="PENDING")
        db.add(req)
        db.commit()
        db.refresh(req)

        log_event(actor=u.username, role=u.role, action="OPENING_CREATE", target=f"opening:{req.id}", ip=request.client.host if request.client else None,
                  success=True, details=f"case_id={c.id} m={payload.m_required}")
        return {"request_id": req.id, "status": req.status, "m_required": req.m_required}
    finally:
        db.close()

@router.get("/solicitudes")
def list_requests(ctx=Depends(require_roles_csrf("admin","custodio"))):
    s, u = ctx
    db = SessionLocal()
    try:
        reqs = db.query(models.OpeningRequest).order_by(models.OpeningRequest.id.desc()).limit(50).all()
        return [{"id": r.id, "case_id": r.case_id, "status": r.status, "m_required": r.m_required} for r in reqs]
    finally:
        db.close()

class ApprovalReq(BaseModel):
    decision: str = Field(default="APPROVE", pattern="^(APPROVE|REJECT)$")

@router.post("/solicitudes/{request_id}/aprobar")
def approve_request(request_id: int, payload: ApprovalReq, request: Request, ctx=Depends(require_roles_csrf("custodio"))):
    s, u = ctx
    db = SessionLocal()
    try:
        req = db.query(models.OpeningRequest).filter(models.OpeningRequest.id == request_id).first()
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")

        # Prevent duplicate approvals by same custodian
        existing = db.query(models.OpeningApproval).filter(
            models.OpeningApproval.request_id == request_id,
            models.OpeningApproval.custodian_id == u.id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Already voted")

        db.add(models.OpeningApproval(request_id=request_id, custodian_id=u.id, decision=payload.decision))
        db.commit()

        # Recompute threshold
        approvals = db.query(models.OpeningApproval).filter(
            models.OpeningApproval.request_id == request_id,
            models.OpeningApproval.decision == "APPROVE"
        ).count()

        if approvals >= req.m_required:
            req.status = "APPROVED_M_REACHED"
            db.commit()

        log_event(actor=u.username, role=u.role, action="OPENING_APPROVAL", target=f"opening:{request_id}", ip=request.client.host if request.client else None,
                  success=True, details=f"decision={payload.decision} approvals={approvals}")
        return {"request_id": request_id, "status": req.status, "approvals": approvals, "m_required": req.m_required}
    finally:
        db.close()
