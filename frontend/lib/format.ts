import type { Cell } from "./types.ts";

const NUMERIC = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[T ]00:00:00(?:\.0+)?(?:Z|[+-]00(?::?00)?)?$/;
const UNGROUPED = /(^|_)(year|yr|id)$/i;

/** Numbers and numeric strings (Postgres numerics arrive as strings) as numbers; anything else null. */
export function toNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && NUMERIC.test(v)) return Number(v);
  return null;
}

/** A result cell as text. Leading-zero codes stay strings; years and ids get no thousands separators. */
export function formatCell(v: Cell, column = ""): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return String(v);
  const n = toNumber(v);
  const code = typeof v === "string" && /^-?0\d/.test(v);
  if (n !== null && !code) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 2, useGrouping: !UNGROUPED.test(column) });
  }
  if (typeof v === "string") return MIDNIGHT.exec(v)?.[1] ?? v;
  return String(v);
}

const sample = (n?: number) => (n === undefined ? "" : ` (n=${n})`);

export const pct = (x: number | null | undefined, n?: number) =>
  x == null ? "-" : `${Math.round(x * 100)}%${sample(n)}`;

export const pts = (x: number | null | undefined) =>
  x == null ? "-" : `${x >= 0 ? "+" : "-"}${Math.abs(Math.round(x * 100))} pts`;

export const f1 = (x: number | null | undefined, n?: number) => (x == null ? "-" : `${x.toFixed(2)}${sample(n)}`);

export const usd = (x: number | null | undefined) =>
  x == null ? "-" : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`;

export const seconds = (ms: number | null | undefined) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)} s`);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
