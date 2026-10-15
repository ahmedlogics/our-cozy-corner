import { AlertTriangle, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, type Priority } from "@/features/priority/priority";

const styles: Record<Priority, string> = {
  NORMAL: "bg-slate-100 text-slate-700 border border-slate-200",
  HIGH: "bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold",
  URGENT: "bg-rose-50 text-rose-700 border border-rose-200 font-bold animate-pulse-subtle",
};

const icons = { NORMAL: Minus, HIGH: ArrowUp, URGENT: AlertTriangle } as const;

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = icons[priority];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs", styles[priority], className)}
      aria-label={`${PRIORITY_LABEL[priority]} priority`}
    >
      <Icon className="size-3" aria-hidden />
      <span>{PRIORITY_LABEL[priority]}</span>
    </span>
  );
}
