import uuid
from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import Document
from backend.database.schemas import DocumentOut

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/upload", response_model=DocumentOut)
async def upload_document(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """
    Placeholder endpoint for future document uploads.
    Currently records metadata only – does not ingest into ChromaDB.
    """
    doc = Document(
        id=str(uuid.uuid4()),
        file_name=file.filename or "unknown",
        file_type=file.content_type,
        source="upload",
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc
