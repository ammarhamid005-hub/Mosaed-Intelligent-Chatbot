"""
populate_database.py
=====================
Loads PDFs, study plans (their extracted JSON) and Markdown (.md) files from the data folder (including
subfolders such as data/study-plans and data/campus), converts them to Markdown chunks,
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
import csv
import json
import shutil
from collections import defaultdict

CHROMA_PATH = "./chroma_db"
DATA_PATH = "./data"


_pipeline_options = PdfPipelineOptions()
_pipeline_options.do_ocr = False  # PDFs have embedded text; OCR wastes memory
_pipeline_options.do_table_structure = True

_converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=_pipeline_options)}
)


_COLLEGES = {
    "cci": "College of Computing and Informatics",
    "sci": "College of Sciences",
}
_UPPER_WORDS = {"msc": "MSc", "bsc": "BSc", "ai": "AI", "it": "IT", "gis": "GIS"}


def _program_name(slug: str) -> str:
    """'msc-computer-science' -> 'MSc Computer Science'."""
    return " ".join(_UPPER_WORDS.get(w, w.capitalize()) for w in slug.split("-"))


def source_label(path: Path) -> str:
    """A short label added to the top of every chunk of a study plan, so a chunk
    that only says 'Semester 1: ...' still says WHICH program it belongs to."""
    parts = [p.lower() for p in path.parts]
    if "study-plans" not in parts:
        return ""
    i = parts.index("study-plans")
    rest = path.parts[i + 1:]
    if len(rest) < 4:  # expected: college/level/program/file.pdf
        return ""
    college, level, program = rest[0], rest[1], rest[2]
    year = ""
    name_bits = path.stem.split("_")
    if len(name_bits) >= 3:
        year = name_bits[2]
    levels = {"bachelors": "Bachelor's", "masters": "Master's"}
    label = f"[Study plan: {_program_name(program)} ({levels.get(level.lower(), level)})"
    label += f", {_COLLEGES.get(college.lower(), college.upper())}"
    if year:
        label += f", catalog year {year}"
    return label + ", University of Sharjah]"


_LEVEL_NAMES = {"bachelors": ("BSc", "Bachelor's"), "masters": ("MSc", "Master's")}
_EXTRACTION_WORDS = ("type_raw", " null", "text layer", "json", "tagged in", "page image")
_TYPE_NAMES = {"compulsory": "compulsory", "elective": "elective", "thesis": "thesis"}


def _degree_name(plan: dict) -> str:
    """'Science in Computer Science' (bachelors) -> 'BSc in Computer Science'."""
    short, _ = _LEVEL_NAMES.get(plan.get("level", ""), ("", ""))
    name = (plan.get("program") or "").strip()
    if name.lower().startswith("science in "):
        name = name[len("science in "):]
    return f"{short} in {name}".strip()


def _track_name(track: str) -> str:
    """'new-students-from-fall-2021-22' -> 'new students from fall 2021-22'."""
    import re
    return re.sub(r"(?<!\d)-|-(?!\d)", " ", track)


def _course_line(c: dict) -> str:
    code = f"{c['code']} " if c.get("code") else ""
    credits = c.get("credits")
    bits = [f"{credits} credit hour{'' if credits == 1 else 's'}" if credits is not None else "credit hours not stated"]
    if c.get("type"):
        bits.append(_TYPE_NAMES.get(c["type"], c["type"]))
    if c.get("prerequisites"):
        bits.append("prerequisite: " + "; ".join(str(x) for x in c["prerequisites"]))
    return f"- {code}{c.get('title', '').strip()} ({', '.join(bits)})"


def _slot_name(c: dict) -> str | None:
    """'Year 1, Fall semester' or 'Term 3'; None for courses not placed in a semester."""
    if c.get("year") is None and c.get("term") is None:
        return None
    parts = []
    if c.get("year") is not None:
        parts.append(f"Year {c['year']}")
    if c.get("semester"):
        parts.append(f"{c['semester'].capitalize()} semester")
    if c.get("term") is not None:
        parts.append(f"Term {c['term']}")
    return ", ".join(parts)


def study_plan_to_markdown(plan: dict) -> tuple[str, str]:
    """Turn one extracted study-plan JSON into (label, markdown text)."""
    degree = _degree_name(plan)
    _, level_word = _LEVEL_NAMES.get(plan.get("level", ""), ("", plan.get("level", "")))
    college = _COLLEGES.get(plan.get("college", ""), plan.get("college", "").upper())
    year = plan.get("catalog_year") or "unknown"
    label = (f"[Study plan: {degree} ({level_word}), {college}, "
             f"catalog year {year}, University of Sharjah]")

    courses = plan.get("courses", [])
    tracks = sorted({c.get("track") for c in courses if c.get("track")}) or [None]
    out = [f"# {degree} study plan ({level_word}), {college}, catalog year {year}", ""]

    # Overview: totals counted from the courses placed in semesters
    out += ["## Overview and credit hour totals", ""]
    if plan.get("total_credit_hours"):
        out.append(f"- Total credit hours (as printed): {plan['total_credit_hours']}")
    for track in tracks:
        by_type: dict = defaultdict(int)
        total = 0
        for c in courses:
            if c.get("track") != track or _slot_name(c) is None or not c.get("credits"):
                continue
            total += c["credits"]
            by_type[c.get("type") or "other"] += c["credits"]
        if not total:
            continue
        name = f" ({_track_name(track)})" if track else ""
        split = ", ".join(f"{v} {k}" for k, v in by_type.items() if k != "other")
        out.append(f"- Credit hours in the semester plan{name}: {total}" + (f" ({split})" if split else ""))
    for note in plan.get("notes", []):
        # Skip notes that only describe how the PDF was extracted
        if any(w in note.lower() for w in _EXTRACTION_WORDS):
            continue
        out.append(f"- Note: {note}")
    out.append("")

    # One section per semester / term, per track
    for track in tracks:
        slots: dict = defaultdict(list)
        for c in courses:
            if c.get("track") == track and _slot_name(c):
                slots[_slot_name(c)].append(c)
        for slot, items in slots.items():
            name = f" ({_track_name(track)})" if track else ""
            credits = sum(c.get("credits") or 0 for c in items)
            out += [f"## {degree}: {slot}{name}, {credits} credit hours", ""]
            out += [_course_line(c) for c in items]
            out.append("")

    # Course lists not placed in a semester (e.g. elective catalogue)
    groups: dict = defaultdict(list)
    for c in courses:
        if _slot_name(c) is None:
            groups[c.get("type_raw") or c.get("type") or "Other courses"].append(c)
    for group, items in groups.items():
        out += [f"## {degree}: {group} (course list, any semester)", ""]
        out += [_course_line(c) for c in items]
        out.append("")
    return label, "\n".join(out)


def _skip(path: Path) -> bool:
    return "_archive" in [p.lower() for p in path.parts]


def load_study_plans():
    """Study plans are loaded from their extracted JSON (cleaner than the PDF tables)."""
    docs = []
    for json_path in Path(DATA_PATH).glob("**/study-plans/**/extracted/*.json"):
        if _skip(json_path):
            continue
        print(f"  Loading: {json_path.name}")
        plan = json.loads(json_path.read_text(encoding="utf-8"))
        label, text = study_plan_to_markdown(plan)
        docs.append(Document(page_content=text, metadata={"source": str(json_path), "label": label}))
    return docs


def load_programs_index():
    """Turn study-plans/_meta/programs_index.csv into a short 'programs per college'
    overview, so questions like 'which Master's programs does CCI offer?' find one chunk."""
    docs = []
    for csv_path in Path(DATA_PATH).glob("**/study-plans/_meta/programs_index.csv"):
        print(f"  Loading: {csv_path.name}")
        rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8-sig").splitlines()))
        grouped: dict = defaultdict(list)
        for r in rows:
            grouped[(r.get("college", ""), r.get("level", ""))].append(r)
        out = ["# University of Sharjah programs that have a study plan available", "",
               "This list covers only the programs whose study plans are available; "
               "it is not a complete list of all UOS programs.", ""]
        for (college, level), items in sorted(grouped.items()):
            short, level_word = _LEVEL_NAMES.get(level, ("", level))
            out += [f"## {level_word} programs, {_COLLEGES.get(college, college.upper())}", ""]
            for r in items:
                name = _degree_name({"level": level, "program": r.get("program_name", "")})
                extra = []
                if r.get("catalog_year"):
                    extra.append(f"catalog year {r['catalog_year']}")
                else:
                    extra.append("study plan not available yet")
                if r.get("credit_hours"):
                    extra.append(f"{r['credit_hours']} credit hours")
                out.append(f"- {name} ({', '.join(extra)})")
            out.append("")
        docs.append(Document(page_content="\n".join(out), metadata={"source": str(csv_path)}))
    return docs


def _has_extracted_json(pdf_path: Path) -> bool:
    return (pdf_path.parent / "extracted" / f"{pdf_path.stem}.json").exists()


def load_markdown():
    """Load hand-written Markdown files (e.g. campus services) as they are."""
    docs = []
    for md_path in Path(DATA_PATH).glob("**/*.md"):
        if md_path.name.lower() == "readme.md" or _skip(md_path):
            continue
        print(f"  Loading: {md_path.name}")
        text = md_path.read_text(encoding="utf-8")
        docs.append(Document(page_content=text, metadata={"source": str(md_path)}))
    return docs


def load_pdf():
    """Load and parse all PDFs from the DATA_PATH into Markdown format."""
    docs = []
    for pdf_path in Path(DATA_PATH).glob("**/*.pdf"):
        if _skip(pdf_path):
            continue
        if _has_extracted_json(pdf_path):
            # The JSON version of this study plan is loaded instead (see load_study_plans)
            continue
        print(f"  Loading: {pdf_path.name}")
        loader = DoclingLoader(
            file_path=str(pdf_path),
            export_type=ExportType.MARKDOWN,
            converter=_converter,
        )
        for doc in loader.lazy_load():
            doc.metadata["source"] = str(pdf_path)
            doc.metadata["label"] = source_label(pdf_path)
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

    # Put the study-plan label on top of every chunk of that plan
    for chunk in result:
        label = chunk.metadata.get("label")
        if label and not chunk.page_content.startswith(label):
            chunk.page_content = f"{label}\n{chunk.page_content}"

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
        if "study-plans" in source_lower:
            chunk.metadata["doc_type"] = "study_plan"
        elif "campus" in source_lower:
            chunk.metadata["doc_type"] = "campus"
        elif "calendar" in source_lower:
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

    documents = load_pdf() + load_study_plans() + load_programs_index() + load_markdown()
    if not documents:
        sys.exit("No PDF, study plan or Markdown files found in ./data")
    chunks = split_documents(documents)
    add_to_chroma(chunks)


if __name__ == "__main__":
    main()