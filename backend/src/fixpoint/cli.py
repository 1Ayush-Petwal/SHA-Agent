import argparse
import asyncio
import json
from typing import TYPE_CHECKING, Any

from fixpoint.config import settings

if TYPE_CHECKING:
    from fixpoint.evals import Split


def main() -> None:
    parser = argparse.ArgumentParser(prog="fixpoint")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("load", help="(Re)load the Olist CSVs into schema olist")
    sub.add_parser("seed-memory", help="Store the golden train split as verified queries (never the test split)")
    ev = sub.add_parser("eval", help="Run the golden set through the agent and record the scores")
    ev.add_argument("--split", choices=["train", "test", "all"], default="test")
    ev.add_argument("--memory", choices=["on", "off"], default="on")
    sub.add_parser("snapshot", help="Run the golden set's gold SQL, check known counts, store result snapshots")
    args = parser.parse_args()

    if args.command == "load":
        from fixpoint.db import load_olist

        for table, n in load_olist(settings.database_url).items():
            print(f"{table:40} {n:>9,}")

    elif args.command == "snapshot":
        from fixpoint.evals import snapshot_golden

        asyncio.run(snapshot_golden())

    elif args.command == "eval":
        asyncio.run(run_eval_cli(args.split, args.memory == "on"))
    elif args.command == "seed-memory":
        asyncio.run(seed_memory())


async def seed_memory() -> None:
    from fixpoint.db import init_app_schema, make_pool
    from fixpoint.evals import load_golden
    from fixpoint.memory import VectorMemory, gemini_embed

    pool = make_pool(settings.database_url)
    await pool.open()
    try:
        await init_app_schema(pool)
        memory = VectorMemory(pool, gemini_embed())
        await memory.load()
        for item in load_golden():
            if item["split"] == "train":
                print(f"{item['id']:28} {await memory.add(item['question'], item['sql'], 'seed')}")
    finally:
        await pool.close()


async def run_eval_cli(split: "Split", memory: bool) -> None:
    from fixpoint import tracing
    from fixpoint.db import init_app_schema, make_pool
    from fixpoint.evals import run_eval, start_run

    def show(r: dict[str, Any]) -> None:
        mark = "ok " if r["final_correct"] else "BAD"
        first = "first-try ok" if r["first_try_correct"] else "first-try wrong"
        print(
            f"{mark} {r['id']:28} {first:16} attempts={r['attempts']} {r['latency_s']:5.1f}s ${r['cost_usd']:.4f}"
            + (f"  {r['error']}" if r["error"] else ""),
            flush=True,
        )

    pool = make_pool(settings.database_url)
    await pool.open()
    try:
        await init_app_schema(pool)
        run_id = await start_run(pool, split, memory)
        print(f"eval run {run_id}: split={split} memory={'on' if memory else 'off'}", flush=True)
        metrics = await run_eval(pool, run_id, split, memory, on_result=show)
        print(json.dumps(metrics, indent=1))
    finally:
        await pool.close()
        tracing.flush()
