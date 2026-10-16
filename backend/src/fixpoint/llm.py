"""The agent's one model seam: prompt in, validated Pydantic object and its cost out."""

from typing import Any, Protocol, TypeVar, cast

from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from fixpoint.config import settings

T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    async def structured(
        self, schema: type[T], prompt: str, *, strong: bool = False, think: bool = True
    ) -> tuple[T, float]:
        """Return the parsed object and its cost in USD. think=False is for writing, not reasoning: much faster."""
        ...


class Gemini:
    def __init__(self) -> None:
        self.models = {  # keyed by (strong, think)
            (False, True): (
                ChatGoogleGenerativeAI(model=settings.fast_model, max_retries=6, timeout=60),
                settings.fast_price,
            ),
            (False, False): (
                ChatGoogleGenerativeAI(model=settings.fast_model, max_retries=6, timeout=60, thinking_level="low"),
                settings.fast_price,
            ),
            (True, True): (
                ChatGoogleGenerativeAI(model=settings.strong_model, max_retries=6, timeout=90),
                settings.strong_price,
            ),
        }

    async def structured(
        self, schema: type[T], prompt: str, *, strong: bool = False, think: bool = True
    ) -> tuple[T, float]:
        model, (price_in, price_out) = self.models[strong, think or strong]
        out = cast(dict[str, Any], await model.with_structured_output(schema, include_raw=True).ainvoke(prompt))
        usage = out["raw"].usage_metadata or {}  # output_tokens includes thinking tokens
        cost = (usage.get("input_tokens", 0) * price_in + usage.get("output_tokens", 0) * price_out) / 1e6
        if out["parsed"] is None:
            raise ValueError(f"{schema.__name__}: model output did not parse: {out['parsing_error']}")
        return out["parsed"], cost
