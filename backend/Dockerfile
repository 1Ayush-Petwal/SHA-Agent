FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.6.17 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1

# Dependencies first, so a code change doesn't reinstall them.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev

# One process: the rate limiter lives in memory. Render's proxy sets X-Forwarded-For.
# ponytail: trusts any forwarder, so a client-supplied X-Forwarded-For can dodge the per-IP limit; the daily cap still holds (issue #2)
# exec: uvicorn gets SIGTERM on redeploy, so a running eval is marked failed rather than left running.
CMD ["sh", "-c", "exec uvicorn fixpoint.api:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
