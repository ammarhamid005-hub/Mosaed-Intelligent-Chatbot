import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import Folder, ChatSession, User
from backend.database.schemas import FolderCreate, FolderRename, FolderOut
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/folders", tags=["Folders"])


@router.get("", response_model=list[FolderOut])
async def list_folders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder)
        .where(Folder.user_id == current_user.id)
        .order_by(Folder.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=FolderOut, status_code=201)
async def create_folder(
    payload: FolderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = Folder(id=str(uuid.uuid4()), user_id=current_user.id, name=payload.name.strip() or "New Folder")
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


@router.patch("/{folder_id}", response_model=FolderOut)
async def rename_folder(
    folder_id: str,
    payload: FolderRename,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found.")
    folder.name = payload.name.strip() or folder.name
    await db.commit()
    await db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Folder not found.")

    # Unassign all sessions in this folder
    await db.execute(
        update(ChatSession)
        .where(ChatSession.folder_id == folder_id)
        .values(folder_id=None)
    )
    await db.execute(sql_delete(Folder).where(Folder.id == folder_id))
    await db.commit()
