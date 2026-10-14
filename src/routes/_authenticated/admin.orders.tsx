import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch, Search } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { EmptyState, ErrorState } from "@/components/shared/States";
import { StatusBadge, StatusTimeline, VehicleIcon, FareReceipt } from "@/components/shared/OrderBits";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { AdminTableSkeleton, PrioritySelect } from "@/components/shared/AdminBits";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminNav, adminOrdersQuery, filterOrders, orderRef, type AdminOrder } from "@/features/admin/admin";
import { STATUS_LABEL, formatPKR, orderQuery, type OrderStatus } from "@/features/orders/orders";
import { PRIORITIES, PRIORITY_LABEL } from "@/features/priority/priority";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [
      { title: "Orders — LogiPulse admin" },
      { name: "description", content: "Search, filter and prioritise every LogiPulse order." },
      { property: "og:title", content: "Orders — LogiPulse admin" },
      { property: "og:description", content: "Search, filter and prioritise every LogiPulse order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Orders,
});

const STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[];

function Orders() {
  useOrdersRealtime([["admin"]]);
  const q = useQuery(adminOrdersQuery);
  const [f, setF] = useState({ q: "", status: "ALL", priority: "ALL" });
  const [open, setOpen] = useState<AdminOrder | null>(null);
  const rows = q.data ? filterOrders(q.data, f) : [];
  const current = open && q.data?.find((o) => o.id === open.id);

  return (
    <DashboardShell role="Admin" title="Orders" items={adminNav("orders")}>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/70 p-4 shadow-soft backdrop-blur sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search order reference, e.g. 3FA2C1D0" aria-label="Search by order reference" className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
          <SelectTrigger className="sm:w-40" aria-label="Filter by priority"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All priorities</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {q.isLoading ? <AdminTableSkeleton /> : q.isError ? <ErrorState description={(q.error as Error).message} /> : rows.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No matching orders" description="Try a different reference or clear the filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>{["Ref", "Customer", "Rider", "Vehicle", "Status", "Priority", "Fare", "Created"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.id} onClick={() => setOpen(o)} className={`animate-enter cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40 ${o.priority === "URGENT" ? "border-l-2 border-l-destructive" : o.priority === "HIGH" ? "border-l-2 border-l-warning" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <td className="px-4 py-3 font-mono text-xs">#{orderRef(o.id)}</td>
                  <td className="px-4 py-3">{o.customer_name}</td>
                  <td className="px-4 py-3">{o.rider_name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><VehicleIcon v={o.vehicle_type} className="size-4 text-primary" />{o.vehicle_type === "CARGO" ? "Cargo" : "Bike"}</span></td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3"><PrioritySelect orderId={o.id} priority={o.priority} status={o.status} /></td>
                  <td className="px-4 py-3 tabular-nums">{formatPKR(o.total_fare)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {current && <OrderDetails o={current} />}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function OrderDetails({ o }: { o: AdminOrder }) {
  const d = useQuery(orderQuery(o.id));
  return (
    <>
      <DialogHeader><DialogTitle className="font-mono">Order #{orderRef(o.id)}</DialogTitle></DialogHeader>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={o.status} /><PriorityBadge priority={o.priority} /><PrioritySelect className="ml-auto" orderId={o.id} priority={o.priority} status={o.status} /></div>
      <div className="grid gap-1 text-sm">
        <p><span className="text-muted-foreground">Customer:</span> {o.customer_name}</p>
        <p><span className="text-muted-foreground">Rider:</span> {o.rider_name ?? "Unassigned"}</p>
        <p><span className="text-muted-foreground">Pickup:</span> {o.pickup_address}</p>
        <p><span className="text-muted-foreground">Drop-off:</span> {o.dropoff_address}</p>
      </div>
      {!d.data?.order ? <AdminTableSkeleton rows={3} /> : (
        <div className="grid gap-6 sm:grid-cols-2">
          <div><h3 className="mb-3 text-sm font-semibold">Status history</h3><StatusTimeline order={d.data.order} events={d.data.events} /></div>
          <FareReceipt distanceKm={d.data.order.distance_km} vehicle={d.data.order.vehicle_type} base={d.data.order.base_fare} distance={d.data.order.distance_fare} care={d.data.order.care_fee} total={d.data.order.total_fare} />
        </div>
      )}
    </>
  );
}
