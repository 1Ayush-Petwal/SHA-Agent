import argparse
import asyncio

from fixpoint.config import settings


def main() -> None:
    parser = argparse.ArgumentParser(prog="fixpoint")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("load", help="(Re)load the Olist CSVs into schema olist")
    sub.add_parser("snapshot", help="Run the golden set's gold SQL, check known counts, store result snapshots")
    args = parser.parse_args()

    if args.command == "load":
        from fixpoint.db import load_olist

        for table, n in load_olist(settings.database_url).items():
            print(f"{table:40} {n:>9,}")

    elif args.command == "snapshot":
        from fixpoint.evals import snapshot_golden

        asyncio.run(snapshot_golden())
