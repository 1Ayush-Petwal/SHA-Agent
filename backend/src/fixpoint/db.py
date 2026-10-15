"""Postgres access: the agent's read-only SQL executor, the app schema, and the Olist loader."""

import csv
import datetime as dt
import re
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg
import yaml
from psycopg_pool import AsyncConnectionPool

DICTIONARY = yaml.safe_load((Path(__file__).parent / "dictionary.yaml").read_text())
DATASETS = Path(__file__).resolve().parents[3] / "data" / "raw" / "olist" / "datasets"
MAX_ROWS = 10_000
TIMEOUT = "15s"
# Leading comments, then a keyword DECLARE ... FOR accepts. Only used to explain a rejection, never to allow one.
READ_STATEMENT = re.compile(r"(\s|--[^\n]*|/\*.*?\*/)*(select|with|values|table|\()", re.IGNORECASE | re.DOTALL)


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[list[Any]]  # JSON-ready values
    truncated: bool  # more than MAX_ROWS rows existed


class SQLError(Exception):
    """A failed agent query. `signature` is stable across identifier changes, so repeats can be detected."""

    def __init__(self, sqlstate: str, message: str):
        super().__init__(f"{sqlstate}: {message}")
        self.sqlstate = sqlstate
        self.message = message

    @property
    def signature(self) -> str:
        first_line = self.message.splitlines()[0] if self.message else ""
        return f"{self.sqlstate}:" + re.sub(r'"[^"]*"|\'[^\']*\'|\b\d+\b', "?", first_line)


def make_pool(url: str) -> AsyncConnectionPool:
    # prepare_threshold=None: Neon's pooler is PgBouncer in transaction mode.
    return AsyncConnectionPool(
        url,
        min_size=1,
        max_size=5,
        open=False,
        check=AsyncConnectionPool.check_connection,  # Neon drops idle connections when compute sleeps
        kwargs={"autocommit": True, "prepare_threshold": None},
    )


def _json_value(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, dt.datetime) and v.time() == dt.time() and v.tzinfo is None:
        return v.date().isoformat()  # date_trunc results read as dates: 2017-11-01, not 2017-11-01T00:00:00
    if isinstance(v, (dt.date, dt.datetime, dt.time)):
        return v.isoformat()
    if isinstance(v, dt.timedelta):
        return v.total_seconds() / 86400  # ponytail: intervals become days, the unit every Olist question uses
    return str(v)


async def run_sql(pool: AsyncConnectionPool, sql: str) -> QueryResult:
    """Run one agent-written statement read-only, with a timeout and a row cap. Raises SQLError."""
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        raise SQLError("42601", "empty query")
    try:
        async with pool.connection() as conn, conn.transaction():
            await conn.execute(
                f"SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '{TIMEOUT}'; SET LOCAL search_path = olist"
            )
            # A server-side cursor streams, so a SELECT * over a million rows never lands in memory.
            # DECLARE ... FOR also only accepts one SELECT/VALUES, which is the single-statement rule.
            async with conn.cursor(name="agent_query") as cur:
                await cur.execute(sql)
                rows = await cur.fetchmany(MAX_ROWS + 1)
                columns = [c.name for c in cur.description or []]
    except psycopg.Error as e:
        message = e.diag.message_primary or str(e)
        if e.sqlstate == "42601" and not READ_STATEMENT.match(sql):
            message = "only a single SELECT (or WITH ... SELECT) statement is allowed"
        elif e.diag.message_hint:
            message += f"\nHINT: {e.diag.message_hint}"
        raise SQLError(e.sqlstate or "XX000", message) from e
    return QueryResult(columns, [[_json_value(v) for v in r] for r in rows[:MAX_ROWS]], len(rows) > MAX_ROWS)


APP_SCHEMA = """
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.verified_queries (
    id bigserial PRIMARY KEY,
    question text NOT NULL,
    sql text NOT NULL,
    tables text[] NOT NULL,
    embedding real[] NOT NULL,
    source text NOT NULL CHECK (source IN ('seed', 'live')),
    status text NOT NULL DEFAULT 'active',
    uses int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.eval_runs (
    id bigserial PRIMARY KEY,
    status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
    split text NOT NULL,
    memory boolean NOT NULL,
    git_sha text NOT NULL,
    model text NOT NULL,
    metrics jsonb,
    error text,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
-- At most one running eval: a second insert fails with unique_violation, which the API turns into 409.
CREATE UNIQUE INDEX IF NOT EXISTS eval_runs_one_running ON app.eval_runs ((true)) WHERE status = 'running';
CREATE TABLE IF NOT EXISTS app.eval_results (
    run_id bigint NOT NULL REFERENCES app.eval_runs ON DELETE CASCADE,
    question_id text NOT NULL,
    result jsonb NOT NULL,
    PRIMARY KEY (run_id, question_id)
);
CREATE TABLE IF NOT EXISTS app.daily_questions (
    day date PRIMARY KEY,
    n int NOT NULL
);
"""


async def init_app_schema(pool: AsyncConnectionPool) -> None:
    """Create the app tables and fail any eval run a restart interrupted."""
    async with pool.connection() as conn:
        await conn.execute(APP_SCHEMA)
        await conn.execute(
            "UPDATE app.eval_runs SET status = 'failed', error = 'interrupted', finished_at = now() WHERE status = 'running'"
        )


PG_TYPES = {
    "text": "text",
    "int": "integer",
    "numeric": "numeric",
    "float": "double precision",
    "timestamp": "timestamp",
}


def load_olist(url: str, datasets: Path = DATASETS) -> dict[str, int]:
    """Drop and reload schema `olist` from the CSVs, typed by dictionary.yaml. Returns row counts."""
    counts = {}
    with psycopg.connect(url) as conn:  # one transaction: a failed load leaves the old data in place
        conn.execute("DROP SCHEMA IF EXISTS olist CASCADE; CREATE SCHEMA olist")
        for table, spec in DICTIONARY["tables"].items():
            path = datasets / f"olist_{table}_dataset.csv"
            if not path.exists():
                path = datasets / f"{table}.csv"
            with path.open(encoding="utf-8-sig", newline="") as f:
                header = next(csv.reader(f))
            if set(header) != set(spec["columns"]):
                raise ValueError(f"{path.name} columns {header} do not match dictionary.yaml")
            cols = ", ".join(f"{c} {PG_TYPES[spec['columns'][c]['type']]}" for c in header)
            conn.execute(f"CREATE TABLE olist.{table} ({cols})")
            with (
                conn.cursor().copy(
                    f"COPY olist.{table} ({', '.join(header)}) FROM STDIN (FORMAT csv, HEADER true)"
                ) as copy,
                path.open("rb") as f,
            ):
                while chunk := f.read(1 << 20):
                    copy.write(chunk)
            counts[table] = conn.execute(f"SELECT count(*) FROM olist.{table}").fetchone()[0]  # type: ignore[index]
        conn.execute("ANALYZE")
    return counts
