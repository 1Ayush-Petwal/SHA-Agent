"""Scoring seam: does a predicted result answer the question the gold result answers?"""

import pytest

from fixpoint.evals import result_matches

GOLD = [["SP", 1849], ["PR", 349], ["MG", 244]]


@pytest.mark.parametrize(
    ("pred", "order_matters", "expected"),
    [
        (GOLD, True, True),
        # column names are not compared, columns may be reordered, extra columns are allowed
        ([[1849, "SP"], [349, "PR"], [244, "MG"]], True, True),
        ([["SP", 1849, 0.6], ["PR", 349, 0.11], ["MG", 244, 0.08]], True, True),
        # every gold column must be present
        ([["SP"], ["PR"], ["MG"]], True, False),
        # order only matters when the question asks for it
        ([["PR", 349], ["SP", 1849], ["MG", 244]], False, True),
        ([["PR", 349], ["SP", 1849], ["MG", 244]], True, False),
        # rows are a multiset: pairing must hold across columns, not per column
        ([["SP", 349], ["PR", 1849], ["MG", 244]], False, False),
        # row count must match
        ([["SP", 1849], ["PR", 349]], False, False),
        ([*GOLD, ["SC", 190]], False, False),
        ([["SP", 1849], ["SP", 1849], ["PR", 349]], False, False),
        # ints and floats are the same number
        ([["SP", 1849.0], ["PR", 349.0], ["MG", 244.0]], True, True),
        # empty or failed predictions are wrong
        ([], False, False),
        (None, False, False),
    ],
)
def test_rows_and_columns(pred, order_matters, expected):
    assert result_matches(GOLD, pred, order_matters) is expected


@pytest.mark.parametrize(
    ("gold", "pred", "expected"),
    [
        ([[137.04]], [[137.04]], True),
        ([[13221498.11]], [[13221498.11 * (1 + 0.00009)]], True),  # within 0.01%
        ([[13221498.11]], [[13221498.11 * (1 + 0.0002)]], False),  # outside 0.01%
        ([[4.16]], [[4.1559]], False),  # unrounded value: 0.1% off
        ([[0.0]], [[0.0]], True),
        ([[0.0]], [[0.00001]], False),
        ([[None]], [[None]], True),
        ([[None]], [[0]], False),
        ([["0"]], [[0]], False),  # text is not a number
    ],
)
def test_values(gold, pred, expected):
    assert result_matches(gold, pred, False) is expected


@pytest.mark.parametrize(
    "month",
    ["2017-11-01", "2017-11", "2017-11-01T00:00:00", "2017-11-01 00:00:00", "2017-11-01T00:00:00+00:00"],
)
def test_dates_compare_as_dates_whatever_their_format(month):
    assert result_matches([["2017-11-01"]], [[month]], False)


def test_dates_with_a_time_keep_it():
    assert not result_matches([["2017-11-24T10:00:00"]], [["2017-11-24"]], False)
    assert result_matches([["2017-11-24T10:00:00"]], [["2017-11-24 10:00:00"]], False)


def test_different_months_differ():
    assert not result_matches([["2017-11-01"]], [["2017-12"]], False)


def r(kind, predicted, first, final, verified=True, cost=0.01, latency=10.0):
    return {
        "kind": kind, "predicted_kind": predicted, "first_try_correct": first, "final_correct": final,
        "verified": verified, "cost_usd": cost, "latency_s": latency,
    }  # fmt: skip


def test_run_metrics():
    from fixpoint.evals import summarize

    results = [
        r("answerable", "answerable", True, True, latency=10),
        r("answerable", "answerable", False, True, latency=20),  # repaired
        r("answerable", "answerable", True, False, latency=30),  # repair regression, and confidently wrong
        r("answerable", "answerable", False, False, verified=False, latency=40),  # unverified: not confidently wrong
        r("answerable", "ambiguous", False, False, verified=False, latency=50),  # false clarification
        r("ambiguous", "ambiguous", True, True, latency=5),
        r("ambiguous", "answerable", False, False, latency=6),  # missed clarification
        r("unanswerable", "unanswerable", True, True, latency=4),
        r("unanswerable", "answerable", False, False, latency=3),
        r("unanswerable", "unanswerable", True, True, latency=2),
    ]
    m = summarize(results)

    assert (m["n"], m["n_answerable"], m["n_ambiguous"], m["n_unanswerable"]) == (10, 5, 2, 3)
    assert (m["first_try_accuracy"], m["final_accuracy"]) == (0.4, 0.4)
    assert m["repair_uplift"] == 0.0
    assert (m["repaired"], m["repair_regressions"], m["confidently_wrong"]) == (1, 1, 1)
    assert m["clarification_f1"] == 0.5  # tp 1, fp 1, fn 1
    assert m["refusal_accuracy"] == 0.667
    assert m["cost_per_correct"] == 0.02  # 0.10 spent, 5 correct
    assert (m["latency_p50_s"], m["latency_p95_s"]) == (8.0, 50.0)
