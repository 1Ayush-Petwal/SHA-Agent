"""Opt-in: proves the agent's SQL path is read-only and single-statement against a real Postgres."""

import asyncio
import os

import pytest

from fixpoint.db import MAX_ROWS, SQLError, make_pool, run_sql

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = [pytest.mark.db, pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")]


def run(sql: str):
    async def go():
        pool = make_pool(URL or "")
        await pool.open()
        try:
            return await run_sql(pool, sql)
        finally:
            await pool.close()

    return asyncio.run(go())


@pytest.mark.parametrize(
    "sql",
    [
        "create table pwned (a int)",
        "with d as (delete from pg_class returning 1) select count(*) from d",
        "select 1; select 2",
    ],
)
def test_rejects_writes_and_multiple_statements(sql):
    with pytest.raises(SQLError):
        run(sql)


def test_read_only_even_for_writes_hidden_in_a_select():
    with pytest.raises(SQLError) as e:
        run("select lo_create(0)")
    assert e.value.sqlstate == "25006"  # read_only_sql_transaction


def test_caps_rows_and_flags_truncation():
    r = run("select generate_series(1, 10005) as n;")
    assert (r.columns, len(r.rows), r.truncated) == (["n"], MAX_ROWS, True)


def test_error_signature_ignores_identifiers():
    sigs = set()
    for col in ("nosuch", "other_missing"):
        with pytest.raises(SQLError) as e:
            run(f"select {col} from pg_class")
        sigs.add(e.value.signature)
    assert sigs == {"42703:column ? does not exist"}
