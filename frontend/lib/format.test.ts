import assert from "node:assert/strict";
import test from "node:test";
import { f1, formatCell, pct, pts, seconds, toNumber, usd } from "./format.ts";

test("toNumber accepts numbers and numeric strings (Postgres numerics), nothing else", () => {
  assert.equal(toNumber(96478), 96478);
  assert.equal(toNumber("4.45"), 4.45);
  assert.equal(toNumber("-12"), -12);
  assert.equal(toNumber("SP"), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(true), null);
  assert.equal(toNumber(""), null);
});

test("formatCell keeps the table readable and honest", () => {
  assert.equal(formatCell(null), "null");
  assert.equal(formatCell(false), "false");
  assert.equal(formatCell(96478), "96,478");
  assert.equal(formatCell("1233131.7234"), "1,233,131.72");
  assert.equal(formatCell("2017-11-01T00:00:00"), "2017-11-01");
  assert.equal(formatCell("2017-11-24T13:05:00"), "2017-11-24T13:05:00");
  assert.equal(formatCell("01001"), "01001");
  assert.equal(formatCell(2017, "year"), "2017");
  assert.equal(formatCell(2017, "order_year"), "2017");
  assert.equal(formatCell("credit_card"), "credit_card");
});

test("formatCell keeps a numeric string's decimal places (up to 2), so a money column lines up", () => {
  assert.equal(formatCell("9.90"), "9.90");
  assert.equal(formatCell("13440.00"), "13,440.00");
  assert.equal(formatCell("4.5"), "4.5");
  assert.equal(formatCell(9.9), "9.9");
});

test("metric formatters show n and never invent a number for null", () => {
  assert.equal(pct(0.7, 10), "70% (n=10)");
  assert.equal(pct(null, 10), "-");
  assert.equal(pts(0.2), "+20 pts");
  assert.equal(pts(-0.1), "-10 pts");
  assert.equal(f1(0.8333, 5), "0.83 (n=5)");
  assert.equal(usd(0.0021), "$0.0021");
  assert.equal(usd(0.0125), "$0.0125");
  assert.equal(usd(1.5), "$1.50");
  assert.equal(seconds(12345), "12.3 s");
  assert.equal(seconds(null), "-");
});
