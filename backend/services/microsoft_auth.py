"""Sign-in with a university Microsoft account.

AUTH_MODE=password   -> the original email + password forms (default, nothing changes)
AUTH_MODE=microsoft  -> one "Continue with Microsoft" button; only ALLOWED_EMAIL_DOMAIN emails get in

The real Microsoft app registration (MS_TENANT_ID / MS_CLIENT_ID) is not wired up yet, so in
microsoft mode verify_id_token() refuses every sign-in until it is.
"""
import os
import re

from fastapi import HTTPException

AUTH_MODE = os.getenv("AUTH_MODE", "password").strip().lower()
ALLOWED_EMAIL_DOMAIN = os.getenv("ALLOWED_EMAIL_DOMAIN", "sharjah.ac.ae").strip().lower().lstrip("@")
# Keeps the original email/password login available next to Microsoft (for the demo students and testing).
AUTH_DEV_LOGIN = os.getenv("AUTH_DEV_LOGIN", "true").strip().lower() == "true"

MS_TENANT_ID = os.getenv("MS_TENANT_ID", "").strip()
MS_CLIENT_ID = os.getenv("MS_CLIENT_ID", "").strip()


def microsoft_enabled() -> bool:
    return AUTH_MODE == "microsoft"


def domain_allowed(email: str) -> bool:
    return email.strip().lower().endswith("@" + ALLOWED_EMAIL_DOMAIN)


# Student email format: U + 7 digits, e.g. U1234567@sharjah.ac.ae
STUDENT_EMAIL_RE = re.compile(r"^u\d{7}@" + re.escape(ALLOWED_EMAIL_DOMAIN) + r"$")


def is_student_email(email: str) -> bool:
    return bool(STUDENT_EMAIL_RE.match(email.strip().lower()))


STUDENT_EMAIL_MESSAGE = f"Use your student email: StudentID@{ALLOWED_EMAIL_DOMAIN} (U followed by 7 digits)."


def verify_id_token(id_token: str) -> dict:
    """Return {'name', 'email'} from a verified Microsoft ID token, or raise HTTPException.

    Needs the app registration (MS_TENANT_ID / MS_CLIENT_ID) and a check of the token signature
    against Microsoft's published keys. Not wired up yet."""
    raise HTTPException(status_code=501, detail="Microsoft sign-in is not configured yet.")
