from collections import Counter

from fixpoint.evals import load_golden


def test_golden_set_shape():
    items = load_golden()
    assert len({i["id"] for i in items}) == len(items) == 30
    assert Counter((i["split"], i["kind"]) for i in items) == {
        ("train", "answerable"): 10,
        ("test", "answerable"): 10,
        ("test", "ambiguous"): 5,
        ("test", "unanswerable"): 5,
    }
    answerable = [i for i in items if i["kind"] == "answerable"]
    assert Counter(i["tier"] for i in answerable) == {1: 8, 2: 8, 3: 4}
    for i in answerable:
        assert i["snapshot"]["rows"], f"{i['id']} has no snapshot; run `fixpoint snapshot`"
        assert len(i["snapshot"]["columns"]) == len(i["snapshot"]["rows"][0])
