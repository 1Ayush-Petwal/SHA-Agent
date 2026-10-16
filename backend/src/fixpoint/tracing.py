"""Langfuse: one trace per question. Tracing is best-effort and never fails a question."""

import asyncio
import logging
import os

from langchain_core.runnables import RunnableConfig
from langfuse import get_client
from langfuse.langchain import CallbackHandler

log = logging.getLogger(__name__)


def new_trace(name: str) -> tuple[RunnableConfig, str | None]:
    """A graph config that records into a fresh trace, and that trace's id. No keys, no tracing."""
    if not os.environ.get("LANGFUSE_SECRET_KEY"):
        return {}, None
    trace_id = get_client().create_trace_id()
    return {"callbacks": [CallbackHandler(trace_context={"trace_id": trace_id})], "run_name": name}, trace_id


async def trace_url(trace_id: str | None) -> str | None:
    if not trace_id:
        return None
    try:  # the first call fetches the project id over the network; later calls reuse it
        return await asyncio.to_thread(get_client().get_trace_url, trace_id=trace_id)
    except Exception:
        log.warning("could not build the Langfuse trace URL", exc_info=True)
        return None


def score(trace_id: str | None, name: str, value: bool) -> None:
    if trace_id:
        get_client().create_score(trace_id=trace_id, name=name, value=float(value), data_type="BOOLEAN")


def flush() -> None:
    if os.environ.get("LANGFUSE_SECRET_KEY"):
        get_client().flush()
