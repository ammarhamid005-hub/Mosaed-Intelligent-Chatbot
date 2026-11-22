"""
visualize_graph.py
==================
Draws part of the knowledge graph (graph_db/) as an interactive web page.

    python -m RAG.visualize_graph withdrawal          # facts about "withdrawal"
    python -m RAG.visualize_graph "G16A" --hops 2     # wider neighbourhood
    python -m RAG.visualize_graph --all               # the whole graph, coloured by document
    python -m RAG.visualize_graph --gexf              # whole graph for Gephi

Opens graph_view.html in the project folder (double-click it to open in the browser).
  - blue dots   = entities (things: forms, deadlines, grades, CGPA ...)
  - orange boxes = document chunks the facts came from
  - arrow text  = the relation DeepSeek extracted
Drag nodes, scroll to zoom, hover a chunk to read its text.
The layout moves for a few seconds while it settles, then stays still.
The whole graph (thousands of nodes) is too big to read on screen, so the page shows
only the entities whose name contains the search word and their neighbours.
"""
import argparse
import html
import json
import os
import re
import webbrowser

GRAPH_PATH = "./graph_db"


def norm(name: str) -> str:  # same as build_graph.norm
    s = name.lower().strip()
    s = re.sub(r"[\"'`“”‘’()\[\]{}:;,.!?]", " ", s)
    s = re.sub(r"^(the|a|an)\s+", "", s)
    return re.sub(r"\s+", " ", s).strip()


def load(name):
    with open(os.path.join(GRAPH_PATH, name), encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("word", nargs="?", default="", help="Show entities containing this word.")
    ap.add_argument("--hops", type=int, default=1, help="How far to go from the matching entities (1 or 2).")
    ap.add_argument("--max", type=int, default=150, help="Maximum entities on the page.")
    ap.add_argument("--no-chunks", action="store_true", help="Hide the document-chunk boxes.")
    ap.add_argument("--gexf", action="store_true", help="Export the whole graph to graph_db/graph.gexf (Gephi).")
    ap.add_argument("--all", action="store_true", help="Draw the whole graph on one page, coloured by document.")
    args = ap.parse_args()

    passages = {p["id"]: p for p in load("passages.json")}
    openie = load("openie.json")

    # relations: entity -> entity with label; entity -> chunk
    rel, ent_label, ent_chunks = {}, {}, {}
    for cid, triples in openie.items():
        for s, r, o in triples:
            ns, no = norm(s), norm(o)
            if not ns or not no or ns == no:
                continue
            ent_label.setdefault(ns, s)
            ent_label.setdefault(no, o)
            rel.setdefault((ns, no), r)
            ent_chunks.setdefault(ns, set()).add(cid)
            ent_chunks.setdefault(no, set()).add(cid)

    if args.gexf:
        export_gexf(rel, ent_label, ent_chunks, passages)
        return

    if args.all:
        export_all(rel, ent_label, ent_chunks, passages)
        return

    if not args.word:
        ap.error('give a word to search, e.g.  python -m RAG.visualize_graph withdrawal')

    neigh = {}
    for (a, b) in rel:
        neigh.setdefault(a, set()).add(b)
        neigh.setdefault(b, set()).add(a)
    w = norm(args.word)
    picked = [e for e in ent_label if w in e]
    if not picked:
        print(f'No entity contains "{args.word}". Try another word (e.g. withdrawal, CGPA, thesis, G16A).')
        return
    picked.sort(key=lambda e: -len(neigh.get(e, ())))
    keep = set(picked[:args.max])
    frontier = set(keep)
    for _ in range(args.hops):
        nxt = set()
        for e in frontier:
            nxt |= neigh.get(e, set())
        nxt -= keep
        room = args.max - len(keep)
        if room <= 0:
            break
        nxt = sorted(nxt, key=lambda e: -len(neigh.get(e, ())))[:room]
        keep |= set(nxt)
        frontier = set(nxt)

    nodes, edges = [], []
    for e in keep:
        nodes.append({"id": "e:" + e, "label": ent_label[e][:40], "title": ent_label[e],
                      "color": "#e8590c" if e in picked else "#1c7ed6",
                      "shape": "dot", "size": 14 if e in picked else 9})
    for (a, b), r in rel.items():
        if a in keep and b in keep:
            edges.append({"from": "e:" + a, "to": "e:" + b, "label": r[:30], "title": r, "arrows": "to"})
    if not args.no_chunks:
        chunks = set()
        for e in picked:
            chunks |= ent_chunks.get(e, set())
        for cid in list(chunks)[:40]:
            p = passages.get(cid, {"text": "", "metadata": {}})
            src = os.path.basename(str(p["metadata"].get("source", cid)))
            nodes.append({"id": "p:" + cid, "label": src[:25], "shape": "box",
                          "color": "#ffd8a8", "title": p["text"][:600]})
            for e in picked:
                if cid in ent_chunks.get(e, ()):
                    edges.append({"from": "e:" + e, "to": "p:" + cid, "dashes": True, "color": "#adb5bd"})

    out = os.path.abspath("graph_view.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(PAGE.replace("__TITLE__", html.escape(args.word))
                .replace("__NODES__", json.dumps(nodes, ensure_ascii=False))
                .replace("__EDGES__", json.dumps(edges, ensure_ascii=False))
                .replace("__STATS__", f"{len(picked)} matching entities, "
                         f"{sum(1 for n in nodes if n['id'].startswith('e:'))} entities shown, "
                         f"{len(edges)} links"))
    print(f"Saved {out}")
    try:
        webbrowser.open("file://" + out)
    except Exception:
        pass


PALETTE = ["#1c7ed6", "#e8590c", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599", "#e03131",
           "#5c940d", "#6741d9", "#c2255c", "#495057", "#1098ad"]


def export_all(rel, ent_label, ent_chunks, passages):
    """Every entity and relation on one page. Each entity is coloured by the document it
    mostly comes from; its size shows how many links it has. Names appear when you zoom in."""
    import collections
    doc_of_chunk = {}
    for cid, p in passages.items():
        src = str(p["metadata"].get("source", cid)).replace("\\", "/")
        name = os.path.splitext(os.path.basename(src))[0]
        doc_of_chunk[cid] = "Study plans" if "study-plans" in src.lower() else name
    degree = collections.Counter()
    for a, b in rel:
        degree[a] += 1
        degree[b] += 1
    ent_doc = {}
    for e, chunks in ent_chunks.items():
        docs = collections.Counter(doc_of_chunk.get(c, "Other") for c in chunks)
        ent_doc[e] = docs.most_common(1)[0][0]
    doc_count = collections.Counter(ent_doc.values())
    colors = {d: PALETTE[i % len(PALETTE)] for i, (d, _) in enumerate(doc_count.most_common())}
    ids = {e: i for i, e in enumerate(ent_label)}
    nodes = [{"id": ids[e], "label": ent_label[e][:40], "title": f"{ent_label[e]}\n({ent_doc.get(e, 'Other')})",
              "color": colors.get(ent_doc.get(e, "Other"), "#868e96"), "value": degree[e] + 1}
             for e in ent_label]
    edges = [{"from": ids[a], "to": ids[b], "title": r} for (a, b), r in rel.items()]
    legend = "".join(f'<span><i style="background:{colors[d]}"></i>{html.escape(d)} ({n})</span>'
                     for d, n in doc_count.most_common())
    out = os.path.abspath("graph_all.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(PAGE_ALL.replace("__NODES__", json.dumps(nodes, ensure_ascii=False))
                .replace("__EDGES__", json.dumps(edges, ensure_ascii=False))
                .replace("__LEGEND__", legend)
                .replace("__STATS__", f"{len(nodes)} entities · {len(edges)} relations"))
    print(f"Saved {out} ({len(nodes)} entities, {len(edges)} relations). It takes a few seconds to lay out.")
    try:
        webbrowser.open("file://" + out)
    except Exception:
        pass


PAGE_ALL = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Mosaed knowledge graph</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>
 body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8f9fa;color:#212529}
 header{padding:10px 16px;background:#fff;border-bottom:1px solid #dee2e6}
 header b{font-size:16px} header small{color:#6c757d;margin-left:10px}
 .key{font-size:12px;margin-top:6px;display:flex;flex-wrap:wrap;gap:4px 14px}
 .key i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
 #status{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#6c757d}
 #g{width:100vw;height:calc(100vh - 92px)}
</style></head><body>
<header><b>Mosaed knowledge graph</b><small>__STATS__ · scroll to zoom in for names · hover for details · click a dot to highlight its links</small>
<div class="key">__LEGEND__</div></header>
<div id="status">Laying out the graph…</div>
<div id="g"></div>
<script>
const nodes = new vis.DataSet(__NODES__), edges = new vis.DataSet(__EDGES__);
const net = new vis.Network(document.getElementById('g'), {nodes, edges}, {
  nodes:{shape:'dot', scaling:{min:3,max:28,label:{enabled:true,min:8,max:22,drawThreshold:9}}, font:{size:12}},
  edges:{color:{color:'#adb5bd',opacity:0.35}, width:0.5, smooth:false, arrows:{to:{enabled:true,scaleFactor:0.3}}},
  physics:{solver:'forceAtlas2Based', forceAtlas2Based:{gravitationalConstant:-30, springLength:60, avoidOverlap:0.2},
           stabilization:{iterations:400, updateInterval:50}},
  layout:{improvedLayout:false},
  interaction:{hover:true, hideEdgesOnDrag:true, tooltipDelay:120}
});
const done = () => { net.setOptions({physics:false}); document.getElementById('status').remove(); };
net.once('stabilizationIterationsDone', done);
setTimeout(() => { if (document.getElementById('status')) done(); }, 30000);
net.on('click', p => net.selectNodes(p.nodes.length ? [p.nodes[0], ...net.getConnectedNodes(p.nodes[0])] : []));
</script></body></html>"""


def export_gexf(rel, ent_label, ent_chunks, passages):
    ids = {e: i for i, e in enumerate(ent_label)}
    x = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<gexf xmlns="http://gexf.net/1.3" version="1.3"><graph defaultedgetype="directed">',
         '<attributes class="edge"><attribute id="0" title="relation" type="string"/></attributes><nodes>']
    for e, i in ids.items():
        x.append(f'<node id="{i}" label="{html.escape(ent_label[e], quote=True)}"/>')
    x.append("</nodes><edges>")
    for k, ((a, b), r) in enumerate(rel.items()):
        x.append(f'<edge id="{k}" source="{ids[a]}" target="{ids[b]}" label="{html.escape(r, quote=True)}">'
                 f'<attvalues><attvalue for="0" value="{html.escape(r, quote=True)}"/></attvalues></edge>')
    x.append("</edges></graph></gexf>")
    out = os.path.join(GRAPH_PATH, "graph.gexf")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(x))
    print(f"Saved {out}: {len(ids)} entities, {len(rel)} relations. Open it in Gephi (gephi.org, free).")


PAGE = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Mosaed graph: __TITLE__</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>
 body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8f9fa;color:#212529}
 header{padding:10px 16px;background:#fff;border-bottom:1px solid #dee2e6}
 header b{font-size:16px} header span{color:#6c757d;font-size:13px;margin-left:10px}
 .key{font-size:13px;margin-top:4px}.key i{display:inline-block;width:11px;height:11px;border-radius:50%;margin:0 4px 0 12px;vertical-align:-1px}
 #g{width:100vw;height:calc(100vh - 62px)}
</style></head><body>
<header><b>Knowledge graph: "__TITLE__"</b><span>__STATS__</span>
<div class="key"><i style="background:#e8590c"></i>matches the word<i style="background:#1c7ed6"></i>related entity
<i style="background:#ffd8a8;border-radius:2px"></i>document chunk (hover to read) &nbsp;·&nbsp; arrow text = relation</div></header>
<div id="g"></div>
<script>
const nodes = new vis.DataSet(__NODES__), edges = new vis.DataSet(__EDGES__);
const net = new vis.Network(document.getElementById('g'), {nodes, edges}, {
  nodes:{font:{size:13}}, edges:{font:{size:10,align:'middle',color:'#495057'},smooth:{type:'dynamic'}},
  physics:{solver:'forceAtlas2Based',forceAtlas2Based:{gravitationalConstant:-60,springLength:120},stabilization:{iterations:200}},
  interaction:{hover:true,tooltipDelay:100}
});
// stop the movement once the layout has settled (dragging a node still works)
net.once('stabilizationIterationsDone', () => net.setOptions({physics: false}));
setTimeout(() => net.setOptions({physics: false}), 8000);
</script></body></html>"""


if __name__ == "__main__":
    main()
