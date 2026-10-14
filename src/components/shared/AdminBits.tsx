import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/shared/CountUp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/features/priority/priority";
import { canChangePriority, setOrderPriority } from "@/features/admin/admin";

export function StatCard({ label, value, hint, icon: Icon, tone = "default", index = 0 }: { label: string; value: number; hint?: string; icon: LucideIcon; tone?: "default" | "warning" | "destructive" | "success"; index?: number }) {
  const toneCls = { default: "bg-primary/10 text-primary", warning: "bg-warning/15 text-warning", destructive: "bg-destructive/15 text-destructive", success: "bg-success/15 text-success" }[tone];
  return (
    <div className="animate-enter rounded-2xl border border-border bg-card/70 p-5 shadow-soft backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/30" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", toneCls)}><Icon className="size-4" /></span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold"><CountUp value={value} /></p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Admin-only priority control; server enforces the rule again. */
export function PrioritySelect({ orderId, priority, status, className }: { orderId: string; priority: Priority; status: string; className?: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const disabled = !canChangePriority(status) || busy;
  const change = async (p: string) => {
    if (p === priority) return;
    setBusy(true);
    try {
      await setOrderPriority(orderId, p as Priority);
      toast.success(`Priority set to ${PRIORITY_LABEL[p as Priority]}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await Promise.all([qc.invalidateQueries({ queryKey: ["admin"] }), qc.invalidateQueries({ queryKey: ["orders"] })]);
      setBusy(false);
    }
  };
  return (
    <div className={cn("flex items-center gap-2", className)} onClick={(e) => e.stopPropagation()}>
      <Select value={priority} onValueChange={change} disabled={disabled}>
        <SelectTrigger className="h-8 w-28 text-xs" aria-label="Change priority"><SelectValue /></SelectTrigger>
        <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
      </Select>
      {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

export function AdminTableSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="space-y-2">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-secondary/60" />)}</div>;
}
