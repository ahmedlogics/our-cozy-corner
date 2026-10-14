import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Package, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, DashCard, EmptyState } from "@/components/shared/States";
import { StatusBadge } from "@/components/shared/OrderBits";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { Button } from "@/components/ui/button";
import { adminOrdersQuery, adminStatsQuery } from "@/features/admin/admin";
import { formatPKR } from "@/features/orders/orders";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin console — LogiPulse" },
      { name: "description", content: "Manage users, orders and live delivery analytics." },
      { property: "og:title", content: "Admin console — LogiPulse" },
      { property: "og:description", content: "Manage users, orders and live delivery analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  useOrdersRealtime([["admin"]]);
  const stats = useQuery(adminStatsQuery);
  const orders = useQuery({ ...adminOrdersQuery, enabled: stats.isSuccess });
  const items = [
    { label: "Analytics", icon: BarChart3, active: true },
    { label: "Orders", icon: Package },
  ];
  if (stats.isLoading) return <DashboardShell role="Admin" title="Operations" items={items}><CardSkeleton rows={4} /></DashboardShell>;
  if (stats.isError || !stats.data) {
    return (
      <DashboardShell role="Admin" title="Operations" items={items}>
        <EmptyState icon={ShieldCheck} title="Admin access required" description="Sign in with an admin account to see live operations." action={<Button asChild variant="hero"><Link to="/auth">Sign in</Link></Button>} />
      </DashboardShell>
    );
  }
  const s = stats.data;
  const cards: [string, number][] = [["Orders today", s.orders_today], ["Waiting", s.pending], ["In progress", s.active], ["Delivered", s.delivered], ["Active riders", s.active_riders]];
  return (
    <DashboardShell role="Admin" title="Operations" items={items}>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([t, v], i) => (
          <div key={t} className="animate-enter" style={{ animationDelay: `${i * 50}ms` }}>
            <DashCard title={t}><p className="font-display text-3xl font-bold tabular-nums">{v}</p></DashCard>
          </div>
        ))}
      </div>
      <DashCard title="Recent orders">
        {!orders.data ? <CardSkeleton rows={3} /> : orders.data.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : (
          <ul className="divide-y divide-border">
            {orders.data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate">{o.pickup_address} → {o.dropoff_address}</span>
                <StatusBadge status={o.status} /><PriorityBadge priority={o.priority} />
                <span className="w-24 text-right font-semibold tabular-nums">{formatPKR(o.total_fare)}</span>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </DashboardShell>
  );
}
