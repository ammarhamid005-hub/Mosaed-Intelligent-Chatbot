from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.database.connection import create_tables
from backend.routers import chat, sessions, feedback, documents, auth, folders


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables on startup
    await create_tables()
    yield


app = FastAPI(
    title="Mosaed - UOS Master's Chatbot",
    description="FastAPI backend for the University of Sharjah Masters Students RAG Chatbot.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow React dev server (and production build) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(sessions.router)
app.include_router(folders.router)
app.include_router(feedback.router)
app.include_router(documents.router)


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "UoS Chatbot API is running."}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
