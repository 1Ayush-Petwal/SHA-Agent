import argparse
import asyncio

from fixpoint.config import settings


def main() -> None:
    parser = argparse.ArgumentParser(prog="fixpoint")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("load", help="(Re)load the Olist CSVs into schema olist")
    sub.add_parser("seed-memory", help="Store the golden train split as verified queries (never the test split)")
    sub.add_parser("snapshot", help="Run the golden set's gold SQL, check known counts, store result snapshots")
    args = parser.parse_args()

    if args.command == "load":
        from fixpoint.db import load_olist

        for table, n in load_olist(settings.database_url).items():
            print(f"{table:40} {n:>9,}")

    elif args.command == "snapshot":
        from fixpoint.evals import snapshot_golden

        asyncio.run(snapshot_golden())

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
