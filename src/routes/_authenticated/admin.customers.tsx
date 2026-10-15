import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { EmptyState, ErrorState } from "@/components/shared/States";
import { StatusBadge } from "@/components/shared/OrderBits";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { AccountToggle, AdminTableSkeleton } from "@/components/shared/AdminBits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminCustomersQuery, adminNav, adminOrdersQuery, orderRef, type AdminCustomer } from "@/features/admin/admin";
import { formatPKR } from "@/features/orders/orders";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customers — LogiPulse admin" },
      { name: "description", content: "Customer accounts, order counts and order history." },
      { property: "og:title", content: "Customers — LogiPulse admin" },
      { property: "og:description", content: "Customer accounts, order counts and order history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Customers,
});

function Customers() {
  useOrdersRealtime([["admin", "customers"], ["admin"]]);
  const q = useQuery(adminCustomersQuery);
  const [open, setOpen] = useState<AdminCustomer | null>(null);
  return (
    <DashboardShell role="Admin" title="Customers" items={adminNav("customers")}>
      {q.isLoading ? <AdminTableSkeleton /> : q.isError ? <ErrorState description={(q.error as Error).message} /> : !q.data?.length ? (
        <EmptyState icon={Users} title="No customers yet" description="Customers appear here after they sign up." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>{["Customer", "Phone", "Orders", "Last order", "Account", ""].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {q.data.map((c, i) => (
                <tr key={c.user_id} className="animate-enter border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <td className="px-4 py-3 font-medium">{c.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{c.order_count}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("en-PK", { dateStyle: "medium" }) : "—"}</td>
                  <td className="px-4 py-3"><AccountToggle userId={c.user_id} active={c.account_active} /></td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" disabled={!c.order_count} onClick={() => setOpen(c)}>History</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {open && <History c={open} />}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function History({ c }: { c: AdminCustomer }) {
  const q = useQuery(adminOrdersQuery);
  const rows = (q.data ?? []).filter((o) => o.customer_id === c.user_id);
  return (
    <>
      <DialogHeader><DialogTitle>{c.full_name} — order history</DialogTitle></DialogHeader>
      {q.isLoading ? <AdminTableSkeleton rows={3} /> : (
        <ul className="divide-y divide-border">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <span className="font-mono text-xs">#{orderRef(o.id)}</span>
              <StatusBadge status={o.status} /><PriorityBadge priority={o.priority} />
              <span className="ml-auto tabular-nums">{formatPKR(o.total_fare)}</span>
              <p className="w-full truncate text-xs text-muted-foreground">{o.pickup_address} → {o.dropoff_address}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
