from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, Gateway, require_roles
from app.core.envelope import Envelope, ok
from app.schemas.assessment import TraitProfile
from app.schemas.common import Role
from app.schemas.profiles import StudentProfileIn, StudentProfileOut

router = APIRouter(prefix="/students", tags=["students"])


@router.get("/me/profile", response_model=Envelope[StudentProfileOut])
def get_profile(p=Depends(require_roles(Role.STUDENT)), gw=Gateway):
    return ok(gw.get_student_profile(p), mock=gw.mock)


@router.put("/me/profile", response_model=Envelope[StudentProfileOut])
def put_profile(body: StudentProfileIn, p=Depends(require_roles(Role.STUDENT)), gw=Gateway):
    return ok(gw.put_student_profile(p, body), mock=gw.mock)


@router.get("/{student_id}/traits", response_model=Envelope[TraitProfile])
def get_traits(student_id: str, p=CurrentUser, gw=Gateway):
    """Students see their own traits; parents see them only with SHARE_RAW_ANSWERS consent (enforced live)."""
    return ok(gw.get_traits(p, student_id), mock=gw.mock)
