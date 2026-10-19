import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** A native <details>: keyboard and screen-reader behavior for free. */
export function Disclosure({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group rounded-md border bg-card", className)}>
      <summary className="flex list-none items-center gap-1.5 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <div className="border-t">{children}</div>
    </details>
  );
}
