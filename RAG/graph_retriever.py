"""
graph_retriever.py
==================
GraphRAG retrieval path (HippoRAG2-style) over the graph made by build_graph.py.

    graph_retrieve(question, query_embedding, k=6) -> [(Document, score), ...]

Steps for one question:
  1. Fact search : the 10 facts closest in meaning to the question, plus up to 5 facts that
                   share its rarest words (e.g. "Fall 2026"), so exact details are not missed
                   (facts use the free local model by default, so the question is embedded
                   with it too; passages keep the Gemini embedding from ChromaDB).
  2. Fact filter : (optional, off by default) the answer model keeps only the relevant facts
                   (HippoRAG2's "recognition memory"); GRAPH_FILTER=1 in .env switches it on.
  3. Seeds       : entities of the kept facts get a starting weight (fact score, divided by how
                   many passages mention the entity), and passages get a small weight from
                   their direct similarity to the question.
  4. PageRank    : Personalized PageRank spreads the weight along the graph links, so passages
                   connected to several relevant facts rise to the top (the multi-hop step).
  5. Passages    : the chunks the kept facts came from first, then the best PageRank chunks,
                   returned in the same (Document, score) form as Chroma.
If the graph is missing or no fact survives, it falls back to plain passage similarity.
"""
import json
import os
import re

import numpy as np
from langchain_core.documents import Document

GRAPH_PATH = "./graph_db"
TOP_FACTS = 10       # facts found by meaning (embeddings)
TOP_KEYWORD_FACTS = int(os.getenv("GRAPH_KEYWORD_FACTS", "5"))
# ... plus facts found by shared rare words. Keywords catch exact details the small local
# model misses, e.g. "Fall 2026" in the question and in a calendar fact.
# GRAPH_KEYWORD_FACTS=0 in .env switches the keyword part off.
# Facts in the other language (Arabic vs English) get their meaning score multiplied by this,
# so an English question is not answered from the Arabic copy of a rule (and vice versa).
OTHER_LANG_FACTOR = float(os.getenv("GRAPH_OTHER_LANG", "0.85"))
_ARABIC = re.compile(r"[\u0600-\u06FF]")


def _is_arabic(text: str) -> bool:
    letters = re.findall(r"[^\W\d_]", text)
    return bool(letters) and len(_ARABIC.findall(text)) / len(letters) > 0.3


_STOP = set("""a an the of to in on at for from by with and or is are was were be been can could
may might must shall should will would do does did have has had i my me we our you your it its this
that these those what which who whom when where why how if then than as not no yes still also only
very more most less into about after before during student students university""".split())
DAMPING = 0.5          # HippoRAG uses a low damping factor so results stay close to the seeds
PASSAGE_WEIGHT = 0.05  # weight of direct passage similarity in the seeds (HippoRAG2 default)

_G = None


def available() -> bool:
    return os.path.exists(os.path.join(GRAPH_PATH, "graph.npz"))


def _load():
    global _G
    if _G is not None:
        return _G

    def j(name):
        with open(os.path.join(GRAPH_PATH, name), encoding="utf-8") as f:
            return json.load(f)

    passages = j("passages.json")
    nodes = j("nodes.json")
    g = np.load(os.path.join(GRAPH_PATH, "graph.npz"))
    fact_emb = np.load(os.path.join(GRAPH_PATH, "fact_emb.npy"))
    p_emb = np.load(os.path.join(GRAPH_PATH, "passage_emb.npy"))
    key_to_node = {n["key"]: i for i, n in enumerate(nodes)}
    passage_node = np.array([key_to_node.get(f"passage::{p['id']}", -1) for p in passages])
    src, dst, w = g["src"], g["dst"], g["w"]
    out_w = np.bincount(src, weights=w, minlength=len(nodes))
    # how many passages each entity is linked to (for the inverse-frequency seed weight)
    is_passage = np.array([n["type"] == "passage" for n in nodes])
    ent_pass_count = np.bincount(src[is_passage[dst]], minlength=len(nodes))

    def unit(m):
        m = m.astype(np.float32)
        return m / (np.linalg.norm(m, axis=1, keepdims=True) + 1e-9)

    mp = os.path.join(GRAPH_PATH, "fact_model.txt")
    fact_model = open(mp, encoding="utf-8").read().strip() if os.path.exists(mp) else "gemini"
    facts = j("facts.json")
    # which chunk(s) each fact was taken from
    pid_index = {p["id"]: i for i, p in enumerate(passages)}
    fact_pos = {f: i for i, f in enumerate(facts)}
    fact_passages = [[] for _ in facts]
    for pid, triples in j("openie.json").items():
        pi = pid_index.get(pid)
        if pi is None:
            continue
        for t in triples:
            fi = fact_pos.get(f"{t[0]} | {t[1]} | {t[2]}")
            if fi is not None and pi not in fact_passages[fi]:
                fact_passages[fi].append(pi)
    toks = [_tokens(f) for f in facts]
    df = {}
    for ts in toks:
        for t in ts:
            df[t] = df.get(t, 0) + 1
    n = max(len(facts), 1)
    idf = {t: float(np.log((n + 1) / (c + 0.5))) for t, c in df.items()}
    fact_tok_index = {}
    for i, ts in enumerate(toks):
        for t in ts:
            fact_tok_index.setdefault(t, []).append(i)
    fact_tok_index = {t: np.array(ix) for t, ix in fact_tok_index.items()}
    _G = {
        "fact_model": fact_model, "idf": idf, "fact_tok_index": fact_tok_index,
        "fact_passages": fact_passages,
        "fact_arabic": np.array([_is_arabic(f) for f in facts], dtype=bool),
        "passages": passages, "nodes": nodes, "src": src, "dst": dst, "w": w, "out_w": out_w,
        "facts": facts, "fact_entities": j("fact_entities.json"),
        "fact_emb": unit(fact_emb) if len(fact_emb) else fact_emb, "p_emb": unit(p_emb),
        "passage_node": passage_node, "ent_pass_count": ent_pass_count,
    }
    return _G


def _tokens(text: str) -> set:
    """Lower-case words with a crude stem (first 5 letters), so withdraw / withdrawal match."""
    out = set()
    for w in re.findall(r"\w+", text.lower()):
        if len(w) < 2 or w in _STOP:
            continue
        out.add(w if w.isdigit() else w[:5])
    return out


def fact_scores(G, question: str, query_embedding):
    """Returns (meaning similarity, keyword score) of every fact for this question."""
    if G["fact_model"].startswith("local:"):  # facts made with the free local model
        from .local_embed import embed as local_embed
        fq = local_embed([question])[0]
    else:
        fq = np.asarray(query_embedding, dtype=np.float32)
    fq = fq / (np.linalg.norm(fq) + 1e-9)
    sim = G["fact_emb"] @ fq
    if OTHER_LANG_FACTOR < 1:
        other = G["fact_arabic"] != _is_arabic(question)
        sim = np.where(other, sim * OTHER_LANG_FACTOR, sim)
    lex = np.zeros(len(G["facts"]))
    qt = [t for t in _tokens(question) if t in G["idf"]]
    if qt:
        w = np.array([G["idf"][t] for t in qt])
        for t, wt in zip(qt, w):
            lex[G["fact_tok_index"][t]] += wt
        lex /= w.sum()
    return sim, lex


def candidate_facts(G, question: str, query_embedding):
    """Top facts by meaning, plus the top facts by keywords that are not already in."""
    sim, lex = fact_scores(G, question, query_embedding)
    picked = list(np.argsort(-sim)[:TOP_FACTS])
    if TOP_KEYWORD_FACTS > 0 and lex.max() > 0:
        for i in np.argsort(-lex):
            if len(picked) >= TOP_FACTS + TOP_KEYWORD_FACTS or lex[i] <= 0:
                break
            if i not in picked:
                picked.append(i)
    return [(G["facts"][i], float(sim[i]), int(i), float(lex[i])) for i in picked]


def _ppr(G, reset, iters=50):
    """Personalized PageRank with numpy only (graph stored as edge lists)."""
    s = reset / reset.sum()
    r = s.copy()
    src, dst, w, out_w = G["src"], G["dst"], G["w"], G["out_w"]
    norm_w = w / np.maximum(out_w[src], 1e-12)
    dangling = out_w == 0
    for _ in range(iters):
        spread = np.bincount(dst, weights=norm_w * r[src], minlength=len(r))
        spread += r[dangling].sum() * s
        r_new = (1 - DAMPING) * s + DAMPING * spread
        if np.abs(r_new - r).sum() < 1e-6:
            return r_new
        r = r_new
    return r


FILTER_PROMPT = """A student asked a question about University of Sharjah rules. Below are facts found in the
university documents. Return the numbers of the facts that are useful for answering the question.
Return JSON only, e.g. {{"keep": [1, 4]}}. Return {{"keep": []}} if none are useful.

Question: {question}

Facts:
{facts}"""


def _filter_facts(question, cand):
    # Off by default: in the multi-hop test it cost ~7 s per question (an extra DeepSeek
    # call) without improving accuracy. GRAPH_FILTER=1 in .env switches it on.
    if os.getenv("GRAPH_FILTER", "0") != "1" or not cand:
        return cand
    try:
        from backend.services.gemini_llm import get_llm_client, _extract_text
        llm = get_llm_client(temperature=0.0, max_tokens=80)
        listing = "\n".join(f"{i + 1}. {f}" for i, (f, _s, _fi) in enumerate(cand))
        reply = _extract_text(llm.invoke(FILTER_PROMPT.format(question=question, facts=listing)).content)
        m = re.search(r"\{.*\}", reply, re.S)
        keep = json.loads(m.group(0)).get("keep", []) if m else None
        if keep is None:
            return cand
        return [cand[i - 1] for i in keep if isinstance(i, int) and 1 <= i <= len(cand)]
    except Exception:
        return cand  # never fail the answer because of the filter


def _doc(G, i, score):
    p = G["passages"][i]
    meta = dict(p["metadata"])
    meta["retrieved_by"] = "graph"
    return Document(page_content=p["text"], metadata=meta), float(score)


def graph_retrieve(question: str, query_embedding, k: int = 6, debug: bool = False):
    G = _load()
    q = np.asarray(query_embedding, dtype=np.float32)
    q = q / (np.linalg.norm(q) + 1e-9)
    p_sim = G["p_emb"] @ q

    # 1–2. facts
    kept = []
    if len(G["facts"]):
        full = candidate_facts(G, question, query_embedding)
        fact_rank = {i: s + lex for _f, s, i, lex in full}  # meaning + keyword score
        cand = [(f, s, i) for f, s, i, _lex in full]
        kept = _filter_facts(question, cand)
    if debug:
        print("  facts kept:", [f for f, _, _ in kept])

    if not kept:  # fall back to plain passage similarity
        top = np.argsort(-p_sim)[:k]
        return [_doc(G, int(i), p_sim[i]) for i in top]

    # 3. seeds
    reset = np.zeros(len(G["nodes"]), dtype=np.float64)
    for _f, score, fi in kept:
        for ent in (G["fact_entities"][fi] or []):
            reset[ent] += score / max(G["ent_pass_count"][ent], 1)
    ent_total = reset.sum()
    top_p = np.argsort(-p_sim)[:20]
    span = p_sim[top_p].max() - p_sim[top_p].min() + 1e-9
    for i in top_p:
        node = G["passage_node"][i]
        if node >= 0:
            reset[node] += PASSAGE_WEIGHT * ent_total * (p_sim[i] - p_sim[top_p].min()) / span

    if reset.sum() <= 0:  # kept facts not linked to the graph: plain passage similarity
        top = np.argsort(-p_sim)[:k]
        return [_doc(G, int(i), p_sim[i]) for i in top]

    # 4. PageRank, 5. passages
    r = _ppr(G, reset)
    scores = np.array([r[n] if n >= 0 else 0.0 for n in G["passage_node"]])
    # The chunks the kept facts were taken from come first, ordered by their best fact
    # (meaning + keyword score), so one precise fact (e.g. a calendar date) is not
    # outranked by chunks that many general facts point to. Then the PageRank ranking.
    prio = {}
    for _f, _s, fi in kept:
        for pi in G["fact_passages"][fi]:
            prio[pi] = max(prio.get(pi, -1e9), fact_rank.get(fi, 0.0))
    source = set(prio)
    first = sorted(source, key=lambda i: (-prio[i], -scores[i]))[:k]
    rest = [int(i) for i in np.argsort(-scores) if int(i) not in source and scores[i] > 0]
    return [_doc(G, int(i), scores[i]) for i in (first + rest)[:k]]
