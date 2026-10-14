import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUp, Flame, Minus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashCard, EmptyState, ErrorState } from "@/components/shared/States";
import { StatusBadge } from "@/components/shared/OrderBits";
import { AdminTableSkeleton, PrioritySelect, StatCard } from "@/components/shared/AdminBits";
import { adminNav, adminOrdersQuery, adminStatsQuery, canChangePriority, orderRef } from "@/features/admin/admin";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/admin/priority")({
  head: () => ({
    meta: [
      { title: "Priority management — LogiPulse admin" },
      { name: "description", content: "Escalate open deliveries to High or Urgent priority." },
      { property: "og:title", content: "Priority management — LogiPulse admin" },
      { property: "og:description", content: "Escalate open deliveries to High or Urgent priority." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PriorityPage,
});

const rank = { URGENT: 0, HIGH: 1, NORMAL: 2 } as const;

function PriorityPage() {
  useOrdersRealtime([["admin"]]);
  const stats = useQuery(adminStatsQuery);
  const orders = useQuery(adminOrdersQuery);
  const open = (orders.data ?? []).filter((o) => canChangePriority(o.status)).sort((a, b) => rank[a.priority] - rank[b.priority] || +new Date(a.created_at) - +new Date(b.created_at));
  return (
    <DashboardShell role="Admin" title="Priority management" items={adminNav("priority")}>
      {stats.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard index={0} label="Normal (open)" value={stats.data.open_normal} icon={Minus} />
          <StatCard index={1} label="High (open)" value={stats.data.open_high} icon={ArrowUp} tone="warning" />
          <StatCard index={2} label="Urgent (open)" value={stats.data.open_urgent} icon={AlertTriangle} tone="destructive" />
        </div>
      )}
      <DashCard title="Open orders" description="Urgent first, then High, then Normal. Delivered orders can't be changed.">
        {orders.isLoading ? <AdminTableSkeleton /> : orders.isError ? <ErrorState description={(orders.error as Error).message} /> : open.length === 0 ? (
          <EmptyState icon={Flame} title="No open orders" description="Nothing to prioritise right now." />
        ) : (
          <ul className="divide-y divide-border">
            {open.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="font-mono text-xs">#{orderRef(o.id)}</span>
                <StatusBadge status={o.status} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.customer_name} · {o.pickup_address}</span>
                <PrioritySelect orderId={o.id} priority={o.priority} status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </DashboardShell>
  );
}
