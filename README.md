# Mosaed – Intelligent Academic Guidance Chatbot

Mosaed (مساعد) is a Retrieval-Augmented Generation (RAG) chatbot designed to assist Master’s degree students at the University of Sharjah (UOS). Built with a FastAPI backend, a Next.js / Vite frontend, and Google Gemini 2.5, Mosaed ingests official academic regulations, calendars, and handbooks to deliver concise, citation-backed answers.

---

## System Architecture

* **Frontend:** Next.js / React (Vite UI), Tailwind CSS
* **Backend:** FastAPI, Python 3.11+, Uvicorn
* **Database & Persistence:**
  * **PostgreSQL:** Manages user authentication, JWT tokens, and chat history.
  * **ChromaDB:** Local vector database for embedding storage and similarity search.
* **Document Processing & RAG:**
  * **Docling:** PDF extraction into structured Markdown (pypdfium2 backend).
  * **LangChain:** Header-aware text splitting (MarkdownHeaderTextSplitter & RecursiveCharacterTextSplitter).
  * **Google Gemini API:** models/gemini-2.5-flash for answer synthesis and query rewriting.

---

## Prerequisites

Ensure you have the following installed before running the project:

* **Python 3.11+**
* **Node.js (v18+) & npm**
* **PostgreSQL** running locally on port 5432 with a database named chatbot_db

---

## Environment Setup (.env)

Create a .env file in the project root directory with the following variables:
```
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/chatbot_db
JWT_SECRET_KEY=supersecretkey123456
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_LLM_MODEL=models/gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
```
---

## Installation & Initial Setup

### 1. Python Environment & Dependencies
```
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install pypdfium2 docling docling-parse docling-ibm-models
```

### 2. Frontend Dependencies
```
cd frontend
npm install
cd ..
```

---

## Populating the Vector Database

Place your academic PDF documents inside the ./data folder. To parse the documents and store vector embeddings in ChromaDB, run:
```
python -m RAG.populate_database --reset
```
Note: Embeddings are saved permanently to disk inside ./chroma_db. You only need to re-run this command if you add or modify PDFs in ./data.

---

## Running the Application

To run the full stack, start both backend and frontend servers:

### Terminal 1: FastAPI Backend (Project Root)
```
uvicorn backend.main:app --reload
```
Backend runs on http://127.0.0.1:8000

### Terminal 2: Next.js Frontend (./frontend)
```
cd frontend
npm run dev
```
Frontend interface runs on http://localhost:5173 (or http://localhost:3000)

---

## Key Technical Features

* **Rate-Limited Batch Ingestion:** Custom chunk batching in populate_database.py to stay strictly within Gemini Free Tier API rate limits (100 RPM).
* **Multi-Format Extraction:** Custom response parser (_extract_text) handles both string and structured content blocks safely.
* **Context-Aware Query Rewriting:** Converts follow-up conversational turns into self-contained standalone queries before vector retrieval.