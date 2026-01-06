from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
from ..rbac.deps import require_roles_csrf
from ..db.session import SessionLocal
from ..db import models
from ..audit.logger import log_event

router = APIRouter(prefix="/secretaria", tags=["secretaria"])

class CaseCreate(BaseModel):
    case_number: str = Field(min_length=3, max_length=50)
    title: str = Field(min_length=3, max_length=200)
    parties: str = Field(min_length=3, max_length=2000)
    assign_to_judge_username: str | None = None

@router.post("/casos")
def create_case(payload: CaseCreate, request: Request, ctx=Depends(require_roles_csrf("secretario"))):
    s, u = ctx
    db = SessionLocal()
    try:
        assigned_id = None
        if payload.assign_to_judge_username:
            j = db.query(models.User).filter(models.User.username == payload.assign_to_judge_username, models.User.role == "juez").first()
            if not j:
                raise HTTPException(status_code=400, detail="Judge not found")
            assigned_id = j.id

        if db.query(models.Case).filter(models.Case.case_number == payload.case_number).first():
            raise HTTPException(status_code=409, detail="Case number already exists")

        c = models.Case(
            case_number=payload.case_number,
            title=payload.title,
            parties=payload.parties,
            created_by=u.id,
            assigned_judge=assigned_id,
            status="CREATED"
        )
        db.add(c)
        db.commit()
        db.refresh(c)

        log_event(actor=u.username, role=u.role, action="CASE_CREATE", target=f"case:{c.id}", ip=request.client.host if request.client else None,
                  success=True, details=f"case_number={payload.case_number}")
        return {"case_id": c.id, "case_number": c.case_number, "status": c.status, "assigned_judge": payload.assign_to_judge_username}
    finally:
        db.close()

@router.get("/casos")
def list_cases(ctx=Depends(require_roles_csrf("secretario"))):
    s, u = ctx
    db = SessionLocal()
    try:
        items = db.query(models.Case).order_by(models.Case.id.desc()).limit(50).all()
        return [{"id": c.id, "case_number": c.case_number, "title": c.title, "status": c.status} for c in items]
    finally:
        db.close()
