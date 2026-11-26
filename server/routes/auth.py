"""Admin login."""
from fastapi import APIRouter
from pydantic import BaseModel

from agent.auth import issue_token

router = APIRouter()


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


@router.post("/auth/login", response_model=LoginResponse)
def login(req: LoginRequest):
    """Exchange the shared admin password for a bearer token used on every mutating request."""
    return LoginResponse(token=issue_token(req.password))
