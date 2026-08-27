"""
populate_database.py
=====================
Loads PDFs from the data folder, converts them to Markdown chunks,
and stores the vector embeddings in ChromaDB.
"""
import sys
import os
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from pathlib import Path
from langchain_docling import DoclingLoader
from langchain_docling.loader import ExportType
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat
from langchain_core.documents import Document
from .get_embedding_function import get_embedding_function
from langchain_chroma import Chroma
import argparse
import shutil

CHROMA_PATH = "./chroma_db"
DATA_PATH = "./data"


_pipeline_options = PdfPipelineOptions()
_pipeline_options.do_ocr = False  # PDFs have embedded text; OCR wastes memory
_pipeline_options.do_table_structure = True

_converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=_pipeline_options)}
)


def load_pdf():
    """Load and parse all PDFs from the DATA_PATH into Markdown format."""
    docs = []
    for pdf_path in Path(DATA_PATH).glob("**/*.pdf"):
        print(f"  Loading: {pdf_path.name}")
        loader = DoclingLoader(
            file_path=str(pdf_path),
            export_type=ExportType.MARKDOWN,
            converter=_converter,
        )
        for doc in loader.lazy_load():
            doc.metadata["source"] = str(pdf_path)
            doc.metadata.pop("dl_meta", None)
            docs.append(doc)
    return docs


_MD_SPLITTER = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")],
    strip_headers=False,
)
_CHAR_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=800, chunk_overlap=120, length_function=len, is_separator_regex=False
)


def split_documents(documents: list[Document]):
    """Split documents semantically by Markdown headers, then by chunk size."""
    result = []
    for doc in documents:
        # Split by markdown headers first — keeps each section (and its tables) together
        md_chunks = _MD_SPLITTER.split_text(doc.page_content)
        for chunk in md_chunks:
            # Carry source metadata forward (MarkdownHeaderTextSplitter drops it)
            for k, v in doc.metadata.items():
                chunk.metadata.setdefault(k, v)
            # Secondary character split only for sections that are too long
            if len(chunk.page_content) > 800:
                result.extend(_CHAR_SPLITTER.split_documents([chunk]))
            else:
                result.append(chunk)

    # Assign sequential page numbers per source so calculate_chunk_ids works
    source_counter: dict = {}
    for chunk in result:
        src = chunk.metadata.get("source", "")
        source_counter[src] = source_counter.get(src, 0) + 1
        chunk.metadata["page"] = source_counter[src]
    return result


def add_to_chroma(chunks: list[Document]):
    """Save document chunks to ChromaDB in rate-limited batches to respect Gemini quota limits."""
    db = Chroma(persist_directory=CHROMA_PATH, embedding_function=get_embedding_function())

    chunks_with_ids = calculate_chunk_ids(chunks)

    existing_ids = set(db.get(include=[])["ids"])
    print(f"Number of existing documents in DB: {len(existing_ids)}")

    new_chunks = [c for c in chunks_with_ids if c.metadata["id"] not in existing_ids]
    if new_chunks:
        print(f">> Adding new documents: {len(new_chunks)}")
        batch_size = 10
        total_batches = (len(new_chunks) + batch_size - 1) // batch_size
        
        for i in range(0, len(new_chunks), batch_size):
            batch = new_chunks[i : i + batch_size]
            batch_ids = [c.metadata["id"] for c in batch]
            db.add_documents(batch, ids=batch_ids)
            current_batch = (i // batch_size) + 1
            print(f"Uploaded batch {current_batch} / {total_batches}")
            
            # Pause 12 seconds between batches to strictly stay within Gemini free tier rate limits
            if current_batch < total_batches:
                time.sleep(12)
    else:
        print("[OK] No new documents to add")


def calculate_chunk_ids(chunks):
    """Generate unique chunk IDs and categorize document types (masters, calendar, general)."""
    last_page_id = None
    current_chunk_index = 0

    for chunk in chunks:
        source = chunk.metadata.get("source") or ""
        page = chunk.metadata.get("page")
        current_page_id = f"{source}:{page}"

        if current_page_id == last_page_id:
            current_chunk_index += 1
        else:
            current_chunk_index = 0

        chunk.metadata["id"] = f"{current_page_id}:{current_chunk_index}"
        last_page_id = current_page_id

        source_lower = source.lower()
        if "calendar" in source_lower:
            chunk.metadata["doc_type"] = "calendar"
        elif (
            "master" in source_lower
            or "_ms" in source_lower
            or "-ms" in source_lower
            or "ماجستير" in source_lower
            or "seminar" in source_lower
        ):
            chunk.metadata["doc_type"] = "masters"
        else:
            chunk.metadata["doc_type"] = "general"

    return chunks


def clear_database():
    """Remove the existing Chroma database directory."""
    if os.path.exists(CHROMA_PATH):
        shutil.rmtree(CHROMA_PATH)


def main():
    """Main pipeline: reset (optional), load, split, and ingest documents."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Reset the database.")
    args = parser.parse_args()
    if args.reset:
        print("[*] Clearing Database")
        clear_database()

    documents = load_pdf()
    if not documents:
        sys.exit("No PDFs found in ./data")
    chunks = split_documents(documents)
    add_to_chroma(chunks)


if __name__ == "__main__":
    main()