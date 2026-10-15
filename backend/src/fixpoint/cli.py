import argparse

from fixpoint.config import settings


def main() -> None:
    parser = argparse.ArgumentParser(prog="fixpoint")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("load", help="(Re)load the Olist CSVs into schema olist")
    args = parser.parse_args()

    if args.command == "load":
        from fixpoint.db import load_olist

        for table, n in load_olist(settings.database_url).items():
            print(f"{table:40} {n:>9,}")
