"""
debug_graph.py
==============
Shows, step by step, what the graph path does for one question.

    python -m RAG.debug_graph "I have more than 25% absences in a Fall 2026 course. Can I still withdraw?"
    python -m RAG.debug_graph "..." --answer      # also times the full answer

Prints: the route, the top facts found, the facts kept by the filter, and the
chunks the graph returns (with their file names).
"""
import os
import sys
import time

import numpy as np
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

from . import graph_retriever as gr
from .get_embedding_function import get_embedding_function
from .router import route


def main():
    q = " ".join(a for a in sys.argv[1:] if a != "--answer").strip()
    if not q:
        sys.exit('Usage: python -m RAG.debug_graph "your question"')
    T = {}

    def tick(name, t0):
        T[name] = time.perf_counter() - t0

    print("QUESTION:", q)
    t0 = time.perf_counter(); r = route(q); tick("router", t0)
    print("ROUTE:", *r)

    t0 = time.perf_counter(); qe = get_embedding_function().embed_query(q); tick("question embedding (Gemini)", t0)
    t0 = time.perf_counter(); G = gr._load(); tick("load graph (first time only)", t0)
    print("FACT MODEL:", G["fact_model"])

    # 1. candidate facts (same as the chatbot: by meaning + by keywords)
    t0 = time.perf_counter(); full = gr.candidate_facts(G, q, qe); tick("fact search (local model)", t0)
    print(f"\nCANDIDATE FACTS (top {gr.TOP_FACTS} by meaning, then up to {gr.TOP_KEYWORD_FACTS} by keywords):")
    for n, (f, s, _, lex) in enumerate(full):
        tag = "meaning" if n < gr.TOP_FACTS else "keyword"
        print(f"  {s:.3f}  kw {lex:.2f}  [{tag}]  {f}")
    cand = [(f, s, i) for f, s, i, _ in full]

    # 2. filter
    t0 = time.perf_counter(); kept = gr._filter_facts(q, cand); tick("fact filter (DeepSeek)", t0)
    print("\nKEPT BY FILTER:")
    for f, _, _ in kept:
        print("  ", f)
    if not kept:
        print("   (none -> falls back to plain passage similarity)")

    # 3. passages
    print("\nCHUNKS RETURNED BY THE GRAPH:")
    t0 = time.perf_counter(); docs = gr.graph_retrieve(q, qe, k=6); tick("whole graph retrieval (search+filter+PageRank)", t0)
    for d, s in docs:
        src = os.path.basename(str(d.metadata.get("source", "")))
        print(f"  {s:.4f}  {src}  |  {d.page_content[:90].replace(chr(10), ' ')}")

    if "--answer" in sys.argv:
        from .query_data import query_rag
        t0 = time.perf_counter(); res = query_rag(q, [], with_route=True); tick("FULL ANSWER (query_rag)", t0)
        print("\nANSWER:\n", res[0])

    print("\nTIMINGS (seconds):")
    for k, v in T.items():
        print(f"  {v:7.2f}  {k}")


if __name__ == "__main__":
    main()
