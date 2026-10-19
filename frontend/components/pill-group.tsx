import { cn } from "@/lib/utils";

/** Café De's pill row: a small set of mutually exclusive choices, each a toggle button. */
export function PillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  mono,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  mono?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full border px-3.5 py-1 text-sm transition-colors",
            mono && "font-mono text-xs",
            o === value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
