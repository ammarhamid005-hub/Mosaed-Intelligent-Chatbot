# Mosaed – Intelligent Academic Guidance Chatbot

Mosaed (مساعد) is a Retrieval-Augmented Generation (RAG) chatbot that helps Master's students at the University of Sharjah (UoS). It reads official academic regulations, calendars and handbooks, and answers students' questions in English or Arabic using only those documents, with sources.

---

## System Architecture

* **Frontend:** React + Vite
* **Backend:** FastAPI (Python), Uvicorn
* **Databases:**
  * **PostgreSQL:** user accounts, login tokens (JWT) and chat history
  * **ChromaDB:** local vector database for document search
* **Document processing:**
  * **Docling:** converts PDFs to structured Markdown (keeps tables)
  * **LangChain:** header-aware chunking (MarkdownHeaderTextSplitter + RecursiveCharacterTextSplitter)
* **AI models (Google Gemini API):**
  * `gemini-3.6-flash` for answers and follow-up question rewriting
  * `gemini-embedding-001` for embeddings

---

## Prerequisites

* **Python 3.11+**
* **Node.js 18+** and npm
* **PostgreSQL** running on port 5432
* **Git** and **VS Code** (recommended)
* A **Gemini API key** from https://aistudio.google.com

---

## 1. Get the Code

```
git clone https://github.com/ammarhamid005-hub/Mosaed-Intelligent-Chatbot.git
cd Mosaed-Intelligent-Chatbot
code .
```

> **Tip:** Avoid keeping the project inside a OneDrive folder. OneDrive syncing can lock or corrupt the `chroma_db` vector database.

---

## 2. Create the PostgreSQL Database

In **pgAdmin**, right-click **Databases → Create → Database…** and name it `chatbot_db`.
The tables are created automatically the first time the backend starts.

---

## 3. Environment Setup (.env)

Create a file named `.env` in the project root:

```
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/chatbot_db
JWT_SECRET_KEY=any-long-random-text
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_LLM_MODEL=gemini-3.6-flash
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
```

> Never commit `.env` (it is already in `.gitignore`). Avoid `@ : / #` in the PostgreSQL password, as they break the connection URL.

---

## 4. Python Environment & Dependencies

```
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script, run this once and try again:

```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then install the packages (with `(.venv)` showing in the terminal):

```
pip install fastapi uvicorn python-dotenv "sqlalchemy[asyncio]" asyncpg "python-jose[cryptography]" bcrypt python-multipart "pydantic[email]" langchain-core langchain-chroma langchain-google-genai langchain-text-splitters langchain-docling docling pypdfium2
```

---

## 5. Frontend Dependencies

```
cd frontend
npm install
cd ..
```

---

## 6. Build the Vector Database

Place the PDFs in `./data`, then run:

```
python -m RAG.populate_database --reset
```

This only needs to run again when PDFs in `./data` are added or changed. Batches pause for 12 seconds to stay within the Gemini free-tier rate limit, so the first build takes a few minutes.

> Docling may print warnings such as `cells matched neither a row nor a column ... dropped from the table`. These are safe to ignore; only **ERROR** messages stop the build.

---

## 7. Run the Application

**Terminal 1 – Backend** (project root, `.venv` active):

```
uvicorn backend.main:app --reload
```

Runs on http://127.0.0.1:8000. API docs: http://127.0.0.1:8000/docs

**Terminal 2 – Frontend:**

```
cd frontend
npm run dev
```

Open http://localhost:5173 and create an account.

**Quick test without the website:**

```
python -m RAG.query_data "What is the minimum GPA to graduate?"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Database not found at ./chroma_db` | Run step 6 and let it finish. |
| `password authentication failed for user "postgres"` | The password in `DATABASE_URL` is wrong. |
| `greenlet` or `email-validator` not installed | Re-run the `pip install` command in step 4. |
| `429 RESOURCE_EXHAUSTED` | Gemini free-tier limit reached. Wait a minute (or until the daily reset at midnight Pacific time). |

---

## Key Technical Features

* **Header-aware chunking:** splits by Markdown headers first so sections and their tables stay together.
* **Context-aware query rewriting:** turns follow-up questions ("what about the thesis?") into standalone questions before searching.
* **Relevance filtering and diversity:** drops weak matches and keeps at most two chunks per page, so one page cannot flood the answer.
* **Grounded answers:** answers only from retrieved documents, refuses out-of-scope questions, and replies in the student's language.
* **Rate-limited ingestion:** batches embedding requests to stay within the Gemini free tier.

---

## Team

* MHD Dib Ali Karima
* Ammar Muhannad Hamid
* Ahmed Ramzi Ali Murshed

**Supervisors:** Dr. Bouziane Brik, Dr. Imad Afyouni
College of Computing and Informatics, University of Sharjah