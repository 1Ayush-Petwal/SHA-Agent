"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { PillGroup } from "@/components/pill-group";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCell, toNumber } from "@/lib/format";
import type { Answer } from "@/lib/types";

const MONTH_START = /^(\d{4}-\d{2})-01$/;
const monthTick = (v: string) => MONTH_START.exec(v)?.[1] ?? v;
const shortTick = (v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v);
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * One metric at a time on one y axis: metrics with different scales (a count and an average) never share a chart.
 * The table below always has the exact values.
 */
export function ResultChart({ answer }: { answer: Answer }) {
  const { chart, columns, rows } = answer;
  const [metric, setMetric] = useState(chart.y[0]);
  const xi = columns.indexOf(chart.x ?? "");
  const yi = columns.indexOf(metric);
  if (xi < 0 || yi < 0) return null;

  const data = rows.map((r) => ({ x: formatCell(r[xi], columns[xi]), y: toNumber(r[yi]) }));
  const config = { y: { label: metric, color: "var(--chart-1)" } } satisfies ChartConfig;
  const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {metric} by {chart.x}
        </span>
        {chart.y.length > 1 && (
          <PillGroup label="Metric to chart" value={metric} options={chart.y} onChange={setMetric} mono />
        )}
      </figcaption>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        {chart.type === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="x" {...axis} minTickGap={28} tickFormatter={monthTick} />
            <YAxis {...axis} width={44} tickFormatter={(v: number) => compact.format(v)} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => monthTick(String(v))} />} />
            <Line
              dataKey="y"
              type="monotone"
              stroke="var(--color-y)"
              strokeWidth={2}
              dot={data.length <= 24 ? { r: 4 } : false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="x" {...axis} interval="preserveStartEnd" minTickGap={12} tickFormatter={shortTick} />
            <YAxis {...axis} width={44} tickFormatter={(v: number) => compact.format(v)} />
            <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent />} />
            <Bar dataKey="y" fill="var(--color-y)" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        )}
      </ChartContainer>
    </figure>
  );
}
