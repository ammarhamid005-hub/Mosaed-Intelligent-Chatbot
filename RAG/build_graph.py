"""
build_graph.py
==============
Builds the knowledge graph for the GraphRAG path (HippoRAG2-style), from the
chunks already stored in ChromaDB.

    python -m RAG.build_graph            # build or continue building
    python -m RAG.build_graph --reset    # start again from nothing

What it does (each stage is saved, so the command can be stopped and re-run):
  1. Passages : reads the chunks from chroma_db (campus services are left out),
                with their existing embeddings.            -> graph_db/passages.json, passage_emb.npy
  2. Facts    : regulations / handbook / calendar chunks: DeepSeek lists the facts as
                (subject, relation, object) triples.
                Study-plan chunks: triples are read straight from the course lines
                (program includes course, course requires prerequisite), no model call.
                                                           -> graph_db/openie.json
  3. Embeddings: embeds every distinct fact. Default: a free local model on the CPU
                (fastembed, no quota). FACT_EMBEDDER=gemini uses Gemini instead
                (one request per fact; stops cleanly on a quota error).
                                                           -> graph_db/fact_emb.npy, facts.json
  4. Graph    : entity and passage nodes; edges subject-object (per fact),
                entity-passage (where it is mentioned), the same entity across
                passages (merged by normalised name) and synonym links between
                entities with very similar names (local model). -> graph_db/graph.npz, nodes.json

Nothing in chroma_db is changed.
"""
import argparse
import json
import os
import re
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from langchain_chroma import Chroma

from .get_embedding_function import get_embedding_function
from .local_embed import embed as local_embed, fact_embedder, MODEL_NAME as LOCAL_MODEL

load_dotenv()

CHROMA_PATH = "./chroma_db"
GRAPH_PATH = "./graph_db"

# Chunks from these folders are NOT put in the graph.
SKIP_SOURCES = ("campus",)
# Study-plan chunks are not sent to DeepSeek: their facts (course, prerequisite, program)
# are read directly from the course lines, which is exact and free.
STUDY_PLAN_SOURCE = "study-plans"
SYNONYM_SIM = 0.85   # entities with names this similar get a "same thing" link (HippoRAG2 synonym edges)
SYNONYM_TOP = 5      # at most this many synonym links per entity

EXTRACT_PROMPT = """You extract facts from a University of Sharjah document for a knowledge graph.

Return the facts in this text as (subject, relation, object) triples.
Rules:
- Use short noun phrases for subject and object (e.g. "thesis defense", "CGPA of 3.0", "form G16A", "Fall 2026 withdrawal deadline").
- Keep numbers, dates, grades, conditions and who-does-what exactly as written.
- Each triple must make sense on its own; repeat the subject instead of using "it" or "this".
- Use the same language as the text (Arabic text gives Arabic triples).
- Tables (for example the academic calendar): one triple per row, and put the semester or section
  from the heading into the subject, e.g. ["Fall 2026/2027 last day for withdrawal from courses", "is", "29 October 2026"].
- The "[From: ...]" line at the top tells you which document and section the text comes from; use it.
- At most 30 triples. If the text has no real facts (headings, links only), return an empty list.

Reply with JSON only, in this form: {{"triples": [["subject", "relation", "object"], ...]}}

Text:
{text}"""


# ── helpers ───────────────────────────────────────────────────────────────
def norm(name: str) -> str:
    """Normalised entity key, so 'The CGPA', 'cgpa' and 'CGPA.' become one node."""
    s = name.lower().strip()
    s = re.sub(r"[\"'`“”‘’()\[\]{}:;,.!?]", " ", s)
    s = re.sub(r"^(the|a|an)\s+", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def fact_text(t) -> str:
    return f"{t[0]} | {t[1]} | {t[2]}"


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def parse_triples(text: str) -> list:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    out = []
    for t in data.get("triples", []):
        if isinstance(t, list) and len(t) == 3 and all(isinstance(x, str) and x.strip() for x in t):
            out.append([x.strip() for x in t])
    return out[:30]


def is_study_plan(p) -> bool:
    src = str(p["metadata"].get("source", "")).replace("\\", "/").lower()
    return STUDY_PLAN_SOURCE in src


_COURSE_LINE = re.compile(r"^\s*-\s+(\d{5,8})\s+(.*?)\s+\(((?:\d+ credit hour|credit hours not stated).*)\)\s*$")
_PROGRAM = re.compile(r"\[Study plan:\s*(.+?)\s*\((Bachelor's|Master's)\)")
_CODE = re.compile(r"\b\d{7}\b")


def study_plan_triples(passages):
    """Course facts read directly from the study-plan chunks (no model call)."""
    sp = [p for p in passages if is_study_plan(p)]
    titles = {}
    for p in sp:  # code -> title, so a prerequisite code gets its course name
        for line in p["text"].splitlines():
            m = _COURSE_LINE.match(line)
            if m:
                titles.setdefault(m.group(1), m.group(2).strip())
    name = lambda code: f"{code} {titles[code]}" if code in titles else code
    out = {}
    for p in sp:
        m = _PROGRAM.search(p["text"])
        program = m.group(1).strip() if m else None
        triples = []
        for line in p["text"].splitlines():
            m = _COURSE_LINE.match(line)
            if not m:
                continue
            code, bits = m.group(1), m.group(3)
            course = name(code)
            if program:
                triples.append([program, "includes course", course])
            pm = re.search(r"prerequisite:\s*(.+)$", bits, re.I)
            if pm:
                for part in pm.group(1).split(";"):
                    codes = _CODE.findall(part)
                    rel = "requires (can be taken together)" if re.search(r"\bco\b|pre/co|co-?req", part, re.I) \
                        else "requires prerequisite"
                    for c in codes:
                        triples.append([course, rel, name(c)])
                    if not codes and part.strip():
                        triples.append([course, "requires", part.strip()[:80]])
        out[p["id"]] = triples
    return out


# ── stage 1: passages ─────────────────────────────────────────────────────
def stage_passages():
    p_json = os.path.join(GRAPH_PATH, "passages.json")
    p_emb = os.path.join(GRAPH_PATH, "passage_emb.npy")
    meta_path = os.path.join(GRAPH_PATH, "passages_meta.json")
    settings = {"skip": list(SKIP_SOURCES)}
    if os.path.exists(p_json) and os.path.exists(p_emb) and load_json(meta_path, {}) == settings:
        passages = load_json(p_json, [])
        print(f"[1/4] Passages: {len(passages)} (already saved)")
        return passages
    if not os.path.exists(CHROMA_PATH):
        sys.exit("chroma_db not found. Run python -m RAG.populate_database first.")
    db = Chroma(persist_directory=CHROMA_PATH, embedding_function=get_embedding_function())
    data = db.get(include=["documents", "metadatas", "embeddings"])
    passages, embs = [], []
    for cid, text, meta, emb in zip(data["ids"], data["documents"], data["metadatas"], data["embeddings"]):
        src = (meta or {}).get("source", "").replace("\\", "/").lower()
        if any(s in src for s in SKIP_SOURCES):
            continue
        passages.append({"id": cid, "text": text, "metadata": meta or {}})
        embs.append(emb)
    np.save(p_emb, np.asarray(embs, dtype=np.float32))
    save_json(p_json, passages)
    save_json(meta_path, settings)
    n_sp = sum(1 for p in passages if is_study_plan(p))
    print(f"[1/4] Passages: {len(passages)} chunks taken from chroma_db "
          f"({len(passages) - n_sp} regulation-type, {n_sp} study-plan)")
    return passages


# ── stage 2: fact extraction ──────────────────────────────────────────────
def stage_extract(passages, workers=4):
    from backend.services.gemini_llm import get_llm_client, _extract_text
    path = os.path.join(GRAPH_PATH, "openie.json")
    done = load_json(path, {})
    sp = study_plan_triples(passages)
    done.update(sp)
    save_json(path, done)
    if sp:
        print(f"[2/4] Study plans: {sum(len(t) for t in sp.values())} course facts read from {len(sp)} chunks")
    todo = [p for p in passages if p["id"] not in done]
    print(f"[2/4] Fact extraction (DeepSeek): {len(done) - len(sp)} done, {len(todo)} to go")
    if not todo:
        return done
    llm = get_llm_client(temperature=0.0, max_tokens=3000)

    def work(p):
        for attempt in range(3):
            try:
                reply = llm.invoke(EXTRACT_PROMPT.format(text=p["text"]))
                return p["id"], parse_triples(_extract_text(reply.content))
            except Exception as e:  # network / rate limit: wait and retry
                err = e
                time.sleep(5 * (attempt + 1))
        print(f"  ! {p['id']}: {str(err)[:120]}")
        return p["id"], None

    n = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(work, p) for p in todo]
        for fut in as_completed(futures):
            cid, triples = fut.result()
            if triples is not None:
                done[cid] = triples
            n += 1
            if n % 10 == 0 or n == len(todo):
                save_json(path, done)
                print(f"  extracted {n}/{len(todo)}")
    save_json(path, done)
    missing = len([p for p in passages if p["id"] not in done])  # noqa
    if missing:
        print(f"  {missing} chunk(s) failed; run the command again to retry them.")
    return done


# ── stage 3: fact embeddings ──────────────────────────────────────────────
def stage_embed(openie, batch=50):
    # Gemini free tier: about 100 embedding requests per minute (each fact = 1 request).
    # 50 facts every 31 s stays under it. EMBED_PAUSE=1 in .env if billing is on.
    pause = float(os.getenv("EMBED_PAUSE", "31"))
    facts_path = os.path.join(GRAPH_PATH, "facts.json")
    emb_path = os.path.join(GRAPH_PATH, "fact_emb.npy")
    model_path = os.path.join(GRAPH_PATH, "fact_model.txt")
    model = f"local:{LOCAL_MODEL}" if fact_embedder() == "local" else "gemini"
    old_model = open(model_path, encoding="utf-8").read().strip() if os.path.exists(model_path) else "gemini"
    all_facts = sorted({fact_text(t) for triples in openie.values() for t in triples})
    have = load_json(facts_path, [])
    if have and old_model != model:  # embeddings from another model can't be mixed
        print(f"[3/4] Fact embeddings were made with {old_model}; redoing them with {model}")
        have = []
    with open(model_path, "w", encoding="utf-8") as f:
        f.write(model)
    embs = list(np.load(emb_path)) if os.path.exists(emb_path) and have else []
    if len(embs) != len(have):  # files out of step: start the embeddings again
        have, embs = [], []
    wanted = set(all_facts)
    if any(f not in wanted for f in have):  # drop facts that no longer exist
        keep = [i for i, f in enumerate(have) if f in wanted]
        have, embs = [have[i] for i in keep], [embs[i] for i in keep]
    have_set = set(have)
    todo = [f for f in all_facts if f not in have_set]
    print(f"[3/4] Fact embeddings ({model}): {len(have)} done, {len(todo)} to go")
    if not todo:
        return have, np.asarray(embs, dtype=np.float32)
    if model != "gemini":
        print("  (first run downloads the local model, about 220 MB)")
        for i in range(0, len(todo), 256):
            part = todo[i:i + 256]
            have.extend(part)
            embs.extend(local_embed(part))
            print(f"  embedded {len(have)}/{len(all_facts)}")
        np.save(emb_path, np.asarray(embs, dtype=np.float32))
        save_json(facts_path, have)
        return have, np.asarray(embs, dtype=np.float32)
    ef = get_embedding_function()

    def save():
        np.save(emb_path, np.asarray(embs, dtype=np.float32))
        save_json(facts_path, have)

    for i in range(0, len(todo), batch):
        part = todo[i:i + batch]
        for attempt in range(4):
            try:
                vecs = ef.embed_documents(part)
                break
            except Exception as e:
                msg = str(e)
                quota = "429" in msg or "RESOURCE_EXHAUSTED" in msg
                per_day = "PerDay" in msg or "per_day" in msg.lower() or "daily" in msg.lower()
                if quota and not per_day and attempt < 3:
                    print("  per-minute limit, waiting 65 s ...")
                    time.sleep(65)
                    continue
                save()
                if quota:
                    sys.exit(f"\n  Gemini embedding daily quota reached after {len(have)} facts. Progress is saved.\n"
                             "  Put a key from a NEW Google project in .env and run the same command again,\n"
                             "  or wait for the daily reset (about 11:00 Dubai time), or enable billing.")
                sys.exit(f"\n  Embedding error: {msg[:300]}\n  Progress is saved; run the command again.")
        have.extend(part)
        embs.extend(vecs)
        save()
        print(f"  embedded {len(have)}/{len(all_facts)}")
        if i + batch < len(todo):
            time.sleep(pause)
    return have, np.asarray(embs, dtype=np.float32)


# ── stage 4: graph ────────────────────────────────────────────────────────
def stage_graph(passages, openie, facts):
    nodes, index = [], {}

    def node(key, kind, label):
        k = f"{kind}::{key}"
        if k not in index:
            index[k] = len(nodes)
            nodes.append({"key": k, "type": kind, "label": label})
        return index[k]

    edges = {}

    def add(a, b, w=1.0):
        if a == b:
            return
        edges[(a, b)] = edges.get((a, b), 0.0) + w
        edges[(b, a)] = edges.get((b, a), 0.0) + w

    fact_index = {f: i for i, f in enumerate(facts)}
    fact_entities = [None] * len(facts)
    for p in passages:
        pn = node(p["id"], "passage", p["id"])
        for t in openie.get(p["id"], []):
            s = node(norm(t[0]), "entity", t[0])
            o = node(norm(t[2]), "entity", t[2])
            add(s, o, 1.0)          # relation between the two entities
            add(s, pn, 1.0)         # entity is mentioned in this passage
            add(o, pn, 1.0)
            fi = fact_index.get(fact_text(t))
            if fi is not None:
                fact_entities[fi] = [s, o]

    # synonym links between entities with almost the same meaning (local model, free)
    ent_ids = [i for i, n in enumerate(nodes) if n["type"] == "entity"]
    n_syn, seen = 0, set()
    if ent_ids:
        print(f"  synonym links: embedding {len(ent_ids)} entity names (local model) ...")
        E = local_embed([nodes[i]["label"] for i in ent_ids])
        E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
        for start in range(0, len(ent_ids), 1000):
            sims = E[start:start + 1000] @ E.T
            for r in range(sims.shape[0]):
                a = start + r
                sims[r, a] = -1
                top = np.argpartition(-sims[r], min(SYNONYM_TOP, len(ent_ids) - 1))[:SYNONYM_TOP]
                for b in top:
                    pair = (min(a, int(b)), max(a, int(b)))
                    if sims[r, b] >= SYNONYM_SIM and pair not in seen:
                        seen.add(pair)
                        add(ent_ids[a], ent_ids[b], float(sims[r, b]))
                        n_syn += 1
    print(f"  synonym links: {n_syn}")

    src = np.array([a for a, _ in edges], dtype=np.int32)
    dst = np.array([b for _, b in edges], dtype=np.int32)
    w = np.array(list(edges.values()), dtype=np.float32)
    np.savez(os.path.join(GRAPH_PATH, "graph.npz"), src=src, dst=dst, w=w)
    save_json(os.path.join(GRAPH_PATH, "nodes.json"), nodes)
    save_json(os.path.join(GRAPH_PATH, "fact_entities.json"), fact_entities)
    n_ent = sum(1 for n in nodes if n["type"] == "entity")
    print(f"[4/4] Graph: {n_ent} entities, {len(passages)} passages, {len(edges) // 2} edges, {len(facts)} facts")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="Delete graph_db and start again.")
    ap.add_argument("--workers", type=int, default=4, help="Parallel extraction requests (default 4).")
    ap.add_argument("--redo", metavar="WORD", help="Extract the facts again for chunks whose file name "
                    "contains WORD, e.g. --redo calendar (uses the newest extraction prompt).")
    args = ap.parse_args()
    if args.reset and os.path.exists(GRAPH_PATH):
        shutil.rmtree(GRAPH_PATH)
    os.makedirs(GRAPH_PATH, exist_ok=True)

    passages = stage_passages()
    if args.redo:
        path = os.path.join(GRAPH_PATH, "openie.json")
        done = load_json(path, {})
        word = args.redo.lower()
        hit = [p for p in passages if word in str(p["metadata"].get("source", "")).lower()]
        for p in hit:
            done.pop(p["id"], None)
        save_json(path, done)
        files = sorted({os.path.basename(str(p["metadata"].get("source", ""))) for p in hit})
        print(f"--redo {args.redo}: {len(hit)} chunk(s) will be extracted again from: {', '.join(files) or 'NO FILE MATCHED'}")
    openie = stage_extract(passages, workers=args.workers)
    facts, _ = stage_embed(openie)
    stage_graph(passages, openie, facts)
    print("\nGraph ready in ./graph_db. Set RETRIEVAL_MODE=hybrid in .env to use it.")


if __name__ == "__main__":
    main()
