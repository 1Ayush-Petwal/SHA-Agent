import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLE: Record<RunStatus, string> = {
  done: "bg-success text-success-foreground",
  running: "border-panel-border bg-panel text-warning-foreground",
  failed: "bg-danger text-danger-foreground",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", STYLE[status])}>
      {status === "running" && <Loader2 className="animate-spin" />}
      {status}
    </Badge>
  );
}
