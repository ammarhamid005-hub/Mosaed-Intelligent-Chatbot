"""
local_embed.py
==============
Free, local embedding model for the graph's FACTS (no API, no quota).
Runs on the CPU with fastembed (ONNX). The model (~220 MB) downloads once, on first use.

    pip install fastembed

Facts are only ever compared with the question embedded by this same model, so they do
not need to use the Gemini model that ChromaDB uses. FACT_EMBEDDER=gemini in .env uses
Gemini instead (needs quota or billing).
"""
import os

import numpy as np

MODEL_NAME = os.getenv("LOCAL_EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
_model = None


def fact_embedder() -> str:
    return os.getenv("FACT_EMBEDDER", "local").lower()


def _get():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(MODEL_NAME)
    return _model


def embed(texts):
    """List of strings -> float32 matrix (one row per text)."""
    return np.asarray(list(_get().embed(list(texts))), dtype=np.float32)
