"""Verified-query memory: rows in app.verified_queries, searched through an in-memory FAISS index."""

import re
from collections.abc import Awaitable, Callable
from typing import Literal

import faiss
import numpy as np
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from psycopg_pool import AsyncConnectionPool

from fixpoint.agent import Memory
from fixpoint.config import settings
from fixpoint.db import DICTIONARY

Embed = Callable[[str], Awaitable[list[float]]]
FLOOR = 0.75  # below this a stored question is not similar enough to help
MERGE = 0.92  # at or above this a new question counts as one already stored
TOP_K = 3


def gemini_embed() -> Embed:
    # RETRIEVAL_QUERY on both sides: question-to-question scores spread out (unrelated ~0.6, paraphrase ~0.9+),
    # where SEMANTIC_SIMILARITY packs everything into 0.78-0.97 and would merge different questions.
    model = GoogleGenerativeAIEmbeddings(model=settings.embed_model, task_type="RETRIEVAL_QUERY")
    return model.aembed_query


def tables_in(sql: str) -> list[str]:
    return [t for t in DICTIONARY["tables"] if re.search(rf"\b{t}\b", sql, re.IGNORECASE)]


def _unit(vector: list[float]) -> np.ndarray:
    v = np.asarray([vector], dtype="float32")
    faiss.normalize_L2(v)
    return v


class VectorMemory:
    # ponytail: one process holds the index; with several API instances each would miss the others' live writes
    def __init__(self, pool: AsyncConnectionPool, embed: Embed):
        self.pool, self.embed = pool, embed
        self.index: faiss.IndexFlatIP | None = None
        self.items: list[tuple[int, str, str]] = []  # (id, question, sql), aligned with index rows

    async def load(self) -> None:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                "SELECT id, question, sql, embedding FROM app.verified_queries WHERE status = 'active' ORDER BY id"
            )
            rows = await cur.fetchall()
        self.index, self.items = None, []
        for id_, question, sql, embedding in rows:
            self._append(id_, question, sql, _unit(embedding))

    def _append(self, id_: int, question: str, sql: str, v: np.ndarray) -> None:
        if self.index is None:
            self.index = faiss.IndexFlatIP(v.shape[1])
        self.index.add(v)
        self.items.append((id_, question, sql))

    def _nearest(self, v: np.ndarray, k: int) -> list[tuple[float, int]]:
        if self.index is None or not self.items:
            return []
        scores, rows = self.index.search(v, min(k, len(self.items)))
        return [(float(s), int(i)) for s, i in zip(scores[0], rows[0], strict=True) if i >= 0]

    async def search(self, question: str) -> list[Memory]:
        v = _unit(await self.embed(question))
        hits = [(s, i) for s, i in self._nearest(v, TOP_K) if s >= FLOOR]
        return [Memory(question=self.items[i][1], sql=self.items[i][2], score=round(s, 3)) for s, i in hits]

    async def add(self, question: str, sql: str, source: Literal["seed", "live"]) -> Literal["inserted", "merged"]:
        """Store a verified answer, or count a use of the near-duplicate already stored."""
        embedding = await self.embed(question)
        v = _unit(embedding)
        nearest = self._nearest(v, 1)
        async with self.pool.connection() as conn:
            if nearest and nearest[0][0] >= MERGE:
                await conn.execute(
                    "UPDATE app.verified_queries SET uses = uses + 1 WHERE id = %s", (self.items[nearest[0][1]][0],)
                )
                return "merged"
            cur = await conn.execute(
                "INSERT INTO app.verified_queries (question, sql, tables, embedding, source) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (question, sql, tables_in(sql), embedding, source),
            )
            row = await cur.fetchone()
        assert row is not None
        self._append(row[0], question, sql, v)
        return "inserted"
