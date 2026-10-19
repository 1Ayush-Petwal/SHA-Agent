import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-[680] tracking-[-0.02em] tabular", tone === "danger" && "text-danger-foreground")}>
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-faint">{note}</p>}
    </div>
  );
}
