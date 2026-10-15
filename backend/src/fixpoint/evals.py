"""Golden set and evaluation."""

import json
from pathlib import Path
from typing import Any

from fixpoint.config import settings
from fixpoint.db import make_pool, run_sql

GOLDEN = Path(__file__).parent / "golden.jsonl"


def load_golden(path: Path = GOLDEN) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


async def snapshot_golden(path: Path = GOLDEN) -> None:
    """Run every gold SQL, check known counts (`expect`), and store the results as snapshots."""
    items = load_golden(path)
    pool = make_pool(settings.database_url)
    await pool.open()
    try:
        for item in items:
            if item["kind"] != "answerable":
                continue
            r = await run_sql(pool, item["sql"])
            if r.truncated or not r.rows:
                raise ValueError(f"{item['id']}: gold result is empty or truncated")
            if "expect" in item and r.rows != item["expect"]:
                raise ValueError(f"{item['id']}: got {r.rows}, known answer is {item['expect']}")
            item["snapshot"] = {"columns": r.columns, "rows": r.rows}
            print(f"{item['id']:28} {len(r.rows):>3} rows  {r.rows[0]}")
    finally:
        await pool.close()
    path.write_text("".join(json.dumps(i) + "\n" for i in items))
