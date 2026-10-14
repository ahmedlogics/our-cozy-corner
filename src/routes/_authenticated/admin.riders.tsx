import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { EmptyState, ErrorState } from "@/components/shared/States";
import { StatusBadge, VehicleIcon } from "@/components/shared/OrderBits";
import { AdminTableSkeleton } from "@/components/shared/AdminBits";
import { Switch } from "@/components/ui/switch";
import { adminNav, adminRidersQuery, orderRef, setAccountActive } from "@/features/admin/admin";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/admin/riders")({
  head: () => ({
    meta: [
      { title: "Riders — LogiPulse admin" },
      { name: "description", content: "Rider roster, vehicles, availability and account access." },
      { property: "og:title", content: "Riders — LogiPulse admin" },
      { property: "og:description", content: "Rider roster, vehicles, availability and account access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Riders,
});

export function AccountToggle({ userId, active }: { userId: string; active: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await setAccountActive(userId, v);
      toast.success(v ? "Account enabled" : "Account disabled");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      setBusy(false);
    }
  };
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <Switch checked={active} disabled={busy} onCheckedChange={toggle} aria-label={active ? "Disable account" : "Enable account"} />
      <span className={active ? "text-success" : "text-destructive"}>{active ? "Enabled" : "Disabled"}</span>
    </label>
  );
}

function Riders() {
  useOrdersRealtime([["admin", "riders"]]);
  const q = useQuery(adminRidersQuery);
  return (
    <DashboardShell role="Admin" title="Riders" items={adminNav("riders")}>
      {q.isLoading ? <AdminTableSkeleton /> : q.isError ? <ErrorState description={(q.error as Error).message} /> : !q.data?.length ? (
        <EmptyState icon={Bike} title="No riders yet" description="Riders appear here once they register from the rider dashboard." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>{["Rider", "Vehicle", "Plate", "Availability", "Current order", "Delivered", "Account"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {q.data.map((r, i) => {
                const fresh = r.location_updated_at && Date.now() - new Date(r.location_updated_at).getTime() < 30 * 60_000;
                const avail = !r.account_active || !r.rider_active ? "Unavailable" : r.active_order_id ? "On delivery" : fresh ? "Available" : "Offline";
                return (
                  <tr key={r.user_id} className="animate-enter border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><VehicleIcon v={r.vehicle_type} className="size-4 text-primary" />{r.vehicle_type === "CARGO" ? "Cargo" : "Bike"}</span></td>
                    <td className="px-4 py-3 font-mono text-xs">{r.plate_number ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{avail}</td>
                    <td className="px-4 py-3">{r.active_order_id && r.active_order_status ? <span className="inline-flex items-center gap-2"><span className="font-mono text-xs">#{orderRef(r.active_order_id)}</span><StatusBadge status={r.active_order_status} /></span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 tabular-nums">{r.delivered_count}</td>
                    <td className="px-4 py-3"><AccountToggle userId={r.user_id} active={r.account_active} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
