import { AlertTriangle, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, type Priority } from "@/features/priority/priority";

const styles: Record<Priority, string> = {
  NORMAL: "bg-secondary text-secondary-foreground",
  HIGH: "bg-warning/15 text-warning ring-1 ring-warning/40",
  URGENT: "bg-destructive/15 text-destructive ring-1 ring-destructive/50 uppercase tracking-wide animate-urgent",
};
const icons = { NORMAL: Minus, HIGH: ArrowUp, URGENT: AlertTriangle } as const;

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = icons[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", styles[priority], className)} aria-label={`${PRIORITY_LABEL[priority]} priority`}>
      <Icon className="size-3" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
