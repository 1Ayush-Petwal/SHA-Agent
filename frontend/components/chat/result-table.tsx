import { formatCell, toNumber } from "@/lib/format";
import type { Cell } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ResultTable({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  // A column is numeric when every non-null value is: then it is right-aligned, header included.
  const numeric = columns.map(
    (_, j) => rows.some((r) => r[j] !== null) && rows.every((r) => r[j] === null || toNumber(r[j]) !== null),
  );
  return (
    <div className="max-h-96 overflow-auto rounded-md border bg-card">
      <table className="data-table font-mono">
        <thead>
          <tr>
            {columns.map((c, j) => (
              <th key={c} className={cn(numeric[j] && "num")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={cn("whitespace-nowrap", numeric[j] && "num", v === null && "text-faint italic")}>
                  {formatCell(v, columns[j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
