"""Agent seam: a question plus scripted LLM, executor and memory in; step events and an answer out."""

import asyncio
from typing import Any

import pytest
from pydantic import BaseModel

from fixpoint.agent import Agent, Answer, Chart, Explanation, Memory, Metric, Plan, Repair, SQLDraft, StepEvent
from fixpoint.db import QueryResult, SQLError


class FakeLLM:
    def __init__(self, *responses: BaseModel):
        self.responses = list(responses)
        self.calls: list[tuple[str, bool, str]] = []  # (schema, strong, prompt)

    async def structured(
        self, schema: type[Any], prompt: str, *, strong: bool = False, think: bool = True
    ) -> tuple[Any, float]:
        self.calls.append((schema.__name__, strong, prompt))
        response = self.responses.pop(0)
        assert isinstance(response, schema), f"agent asked for {schema.__name__}, script has {response!r}"
        return response, 0.001


class FakeSQL:
    def __init__(self, results: dict[str, QueryResult | SQLError]):
        self.results = results
        self.calls: list[str] = []

    async def __call__(self, sql: str) -> QueryResult:
        self.calls.append(sql)
        r = self.results[sql]
        if isinstance(r, SQLError):
            raise r
        return r


class FakeMemory:
    def __init__(self, *memories: Memory):
        self.memories = list(memories)

    async def search(self, question: str) -> list[Memory]:
        return self.memories


def ask(llm: FakeLLM, sql: FakeSQL, question: str = "How many orders are there?", memory: FakeMemory | None = None):
    async def go():
        return [e async for e in Agent(llm, sql, memory).run(question)]

    events = asyncio.run(go())
    assert not llm.responses, f"unused scripted responses: {llm.responses}"
    steps = [e for e in events if isinstance(e, StepEvent)]
    (answer,) = [e for e in events if isinstance(e, Answer)]
    assert events[-1] is answer
    return steps, answer


COUNT_PLAN = Plan(
    kind="answerable",
    steps=["count orders"],
    dimensions=[],
    metrics=[Metric(name="orders", type="count")],
    expect_rows="one",
)
ORDERS = QueryResult(["orders"], [[99441]], False)


def test_answers_a_simple_question_first_try():
    llm = FakeLLM(COUNT_PLAN, SQLDraft(sql="q1"), Explanation(text="There are 99,441 orders."))
    steps, answer = ask(llm, FakeSQL({"q1": ORDERS}))

    assert [s.node for s in steps] == ["planner", "coder", "executor", "verifier", "explainer"]
    assert answer.kind == "answerable"
    assert answer.verified and answer.attempts == 1
    assert (answer.sql, answer.columns, answer.rows) == ("q1", ["orders"], [[99441]])
    assert answer.text == "There are 99,441 orders."
    assert answer.chart.type == "table"
    assert answer.warnings == []
    assert answer.first_try == ORDERS
    assert answer.cost_usd == 0.003


def test_ambiguous_question_ends_with_clickable_interpretations():
    options = ["Top 10 customers by delivered revenue", "Top 10 customers by number of orders"]
    sql = FakeSQL({})
    steps, answer = ask(FakeLLM(Plan(kind="ambiguous", options=options)), sql, "Who are our best customers?")

    assert [s.node for s in steps] == ["planner"]
    assert answer.kind == "ambiguous"
    assert answer.options == options
    assert answer.text and not answer.verified and answer.attempts == 0
    assert sql.calls == []


def test_unanswerable_question_ends_with_reason_and_closest_question():
    plan = Plan(
        kind="unanswerable",
        refusal_reason="The warehouse has prices but no product costs.",
        closest_question="What is delivered revenue by product category?",
    )
    steps, answer = ask(FakeLLM(plan), FakeSQL({}), "What is the profit margin by category?")

    assert [s.node for s in steps] == ["planner"]
    assert answer.kind == "unanswerable"
    assert answer.refusal_reason == plan.refusal_reason
    assert answer.closest_question == plan.closest_question
    assert plan.refusal_reason in answer.text


def test_sql_error_is_repaired_on_the_next_attempt():
    error = SQLError("42703", 'column "order_count" does not exist')
    llm = FakeLLM(
        COUNT_PLAN,
        SQLDraft(sql="q1"),
        Repair(diagnosis="no such column", sql="q2"),
        Explanation(text="There are 99,441 orders."),
    )
    steps, answer = ask(llm, FakeSQL({"q1": error, "q2": ORDERS}))

    assert [s.node for s in steps] == [
        "planner", "coder", "executor", "debugger", "executor", "verifier", "explainer"
    ]  # fmt: skip
    assert answer.verified and answer.attempts == 2 and answer.sql == "q2"
    assert answer.first_try is None  # attempt 1 produced no result
    debugger_prompt = next(p for name, _, p in llm.calls if name == "Repair")
    assert "q1" in debugger_prompt and 'column "order_count" does not exist' in debugger_prompt


def test_same_failure_twice_in_a_row_goes_back_to_the_planner():
    llm = FakeLLM(
        COUNT_PLAN,
        SQLDraft(sql="q1"),
        Repair(diagnosis="wrong column", sql="q2"),
        COUNT_PLAN,
        SQLDraft(sql="q3"),
        Explanation(text="There are 99,441 orders."),
    )
    sql = FakeSQL(
        {
            "q1": SQLError("42703", 'column "order_count" does not exist'),
            "q2": SQLError("42703", 'column "n_orders" does not exist'),  # same failure, different identifier
            "q3": ORDERS,
        }
    )
    steps, answer = ask(llm, sql)

    assert [s.node for s in steps] == [
        "planner", "coder", "executor", "debugger", "executor", "planner", "coder", "executor", "verifier", "explainer"
    ]  # fmt: skip
    assert answer.verified and answer.attempts == 3
    replan_prompt = [p for name, _, p in llm.calls if name == "Plan"][1]
    assert 'column "n_orders" does not exist' in replan_prompt


def test_gives_up_after_three_repairs_with_an_unverified_answer():
    llm = FakeLLM(
        COUNT_PLAN,
        SQLDraft(sql="q1"),
        Repair(diagnosis="a", sql="q2"),
        Repair(diagnosis="b", sql="q3"),
        Repair(diagnosis="c", sql="q4"),
    )
    sql = FakeSQL(
        {
            "q1": SQLError("42703", 'column "a" does not exist'),
            "q2": SQLError("42P01", 'relation "b" does not exist'),
            "q3": SQLError("42883", "function c(integer) does not exist"),
            "q4": SQLError("57014", "canceling statement due to statement timeout"),
        }
    )
    steps, answer = ask(llm, sql)

    assert [(name, strong) for name, strong, _ in llm.calls] == [
        ("Plan", False), ("SQLDraft", False), ("Repair", False), ("Repair", False), ("Repair", True)
    ]  # fmt: skip
    assert steps[-1].node == "explainer"
    assert not answer.verified and answer.attempts == 4
    assert answer.rows == []
    assert "could not verify" in answer.text.lower()
    assert "statement timeout" in answer.text  # says what was tried


STATE_PLAN = Plan(
    kind="answerable",
    steps=["count orders per state"],
    dimensions=["state"],
    metrics=[Metric(name="orders", type="count"), Metric(name="late_pct", type="pct")],
    expect_rows="many",
)
BY_STATE = QueryResult(["state", "orders", "late_pct"], [["SP", 41746, 5.9], ["RJ", 12852, 13.5]], False)


@pytest.mark.parametrize(
    ("check", "bad"),
    [
        ("empty_result", QueryResult(["state", "orders", "late_pct"], [], False)),
        ("empty_result", QueryResult(["state", "orders", "late_pct"], [["SP", 41746, 5.9]], False)),  # many expected
        ("grain_duplicates", QueryResult(["state", "orders", "late_pct"], [["SP", 1, 5.0], ["SP", 2, 6.0]], False)),
        ("range", QueryResult(["state", "orders", "late_pct"], [["SP", -3, 5.9], ["RJ", 1, 13.5]], False)),
        ("range", QueryResult(["state", "orders", "late_pct"], [["SP", 3, 590.0], ["RJ", 1, 13.5]], False)),
        ("null_metric", QueryResult(["state", "orders", "late_pct"], [["SP", 3, None], ["RJ", 1, None]], False)),
        (
            "missing_columns",
            QueryResult(["customer_state", "orders", "late_pct"], [["SP", 3, 5.9], ["RJ", 1, 1.0]], False),
        ),
    ],
)
def test_result_that_runs_but_is_wrong_goes_to_the_debugger(check, bad):
    llm = FakeLLM(
        STATE_PLAN,
        SQLDraft(sql="q1"),
        Repair(diagnosis="fix", sql="q2"),
        Explanation(text="SP has 41746 orders and RJ 12852."),
    )
    steps, answer = ask(llm, FakeSQL({"q1": bad, "q2": BY_STATE}), "Orders and late share by state?")

    assert [s.node for s in steps] == [
        "planner", "coder", "executor", "verifier", "debugger", "executor", "verifier", "explainer"
    ]  # fmt: skip
    assert check in steps[3].detail
    assert answer.verified and answer.attempts == 2 and answer.rows == BY_STATE.rows
    assert answer.first_try == bad  # attempt 1's result is kept for first-try scoring even though it was rejected
    debugger_prompt = next(p for name, _, p in llm.calls if name == "Repair")
    assert check in debugger_prompt


def test_memories_are_given_to_the_coder_and_reported():
    memory = Memory(
        question="How many delivered orders?", sql="SELECT count(*) AS orders FROM orders WHERE x", score=0.88
    )
    llm = FakeLLM(COUNT_PLAN, SQLDraft(sql="q1"), Explanation(text="There are 99,441 orders."))
    steps, answer = ask(llm, FakeSQL({"q1": ORDERS}), memory=FakeMemory(memory))

    assert answer.memories_used == [memory]
    coder_prompt = next(p for name, _, p in llm.calls if name == "SQLDraft")
    assert memory.question in coder_prompt and memory.sql in coder_prompt
    assert "1 similar verified" in steps[0].detail or "1 similar verified" in steps[1].detail


def test_numbers_not_in_the_result_make_the_explainer_retry_once():
    llm = FakeLLM(
        COUNT_PLAN,
        SQLDraft(sql="q1"),
        Explanation(text="There are 12,345 orders."),
        Explanation(text="There are 99,441 orders."),
    )
    _, answer = ask(llm, FakeSQL({"q1": ORDERS}))

    retry_prompt = [p for name, _, p in llm.calls if name == "Explanation"][1]
    assert "12,345" in retry_prompt
    assert answer.text == "There are 99,441 orders." and answer.warnings == []


def test_numbers_still_not_in_the_result_after_the_retry_become_a_warning():
    llm = FakeLLM(
        COUNT_PLAN,
        SQLDraft(sql="q1"),
        Explanation(text="There are 12,345 orders."),
        Explanation(text="There are about 100,000 orders."),
    )
    _, answer = ask(llm, FakeSQL({"q1": ORDERS}))

    assert answer.verified
    assert [w for w in answer.warnings if w.startswith("numbers_in_text")] == [
        "numbers_in_text: 100,000 in the explanation does not appear in the result"
    ]


MONTH_PLAN = Plan(
    kind="answerable",
    steps=["count orders per month"],
    dimensions=["month"],
    metrics=[Metric(name="orders", type="count")],
    expect_rows="many",
)
MONTHLY = QueryResult(
    ["month", "orders"],
    [["2016-09-01", 4], ["2016-10-01", 324], ["2016-12-01", 1], ["2017-01-01", 800], ["2017-02-01", 1780]],
    False,
)


def test_trend_with_partial_months_is_flagged_and_drawn_as_a_line():
    llm = FakeLLM(
        MONTH_PLAN, SQLDraft(sql="q1"), Explanation(text="Orders rose from 4 in 2016-09 to 1,780 in 2017-02.")
    )
    _, answer = ask(llm, FakeSQL({"q1": MONTHLY}), "Monthly orders?")

    assert answer.verified
    assert answer.warnings == [
        "partial_period: 2016-09, 2016-12 have under 10% of the median volume, likely incomplete"
    ]
    assert answer.chart == Chart(type="line", x="month", y=["orders"])


def test_breakdown_is_drawn_as_a_bar_chart():
    llm = FakeLLM(STATE_PLAN, SQLDraft(sql="q1"), Explanation(text="SP leads with 41,746 orders."))
    _, answer = ask(llm, FakeSQL({"q1": BY_STATE}), "Orders by state?")

    assert answer.chart == Chart(type="bar", x="state", y=["orders", "late_pct"])
