from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


# ──────────────── Auth ────────────────

class SignUpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return v.strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: Optional[str]
    email: Optional[str]
    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ──────────────── Chat ────────────────

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    question: str


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    answer: str


# ──────────────── Folders ────────────────

class FolderCreate(BaseModel):
    name: str

class FolderRename(BaseModel):
    name: str

class FolderOut(BaseModel):
    id: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────── Sessions ────────────────

class SessionCreate(BaseModel):
    title: Optional[str] = "New Chat"


class SessionPatch(BaseModel):
    folder_id: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    title: str
    folder_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ──────────────── Messages ────────────────

class MessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────── Feedback ────────────────

class FeedbackRequest(BaseModel):
    message_id: str
    rating: str          # "positive" or "negative"
    comment: Optional[str] = None


class FeedbackOut(BaseModel):
    id: str
    message_id: str
    rating: str
    comment: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────── Documents ────────────────

class DocumentOut(BaseModel):
    id: str
    file_name: str
    file_type: Optional[str]
    source: Optional[str]
    uploaded_at: datetime
    status: str

    model_config = {"from_attributes": True}
