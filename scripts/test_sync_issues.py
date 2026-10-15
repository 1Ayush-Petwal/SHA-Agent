"""Run: python3 scripts/test_sync_issues.py"""
from sync_issues import render, slug

base = {
    "number": 7, "title": "Fix: CSV loader crash!", "body": "Steps\n", "state": "OPEN",
    "url": "https://github.com/o/r/issues/7", "author": {"login": "a"}, "createdAt": "2026-10-15T00:00:00Z",
    "labels": [{"name": "bug"}, {"name": "ready-for-agent"}],
    "comments": [{"author": {"login": "b"}, "createdAt": "2026-10-16T00:00:00Z", "body": "repro'd"}],
}

assert slug(base["title"]) == "fix-csv-loader-crash"
out = render(base)
assert "Status: ready-for-agent" in out and "Labels: bug, ready-for-agent" in out
assert "## Comments" in out and "**b** (2026-10-16):" in out
assert "Status: closed" in render({**base, "state": "CLOSED"})
assert "Status: untriaged" in render({**base, "labels": [], "comments": []})
print("ok")
