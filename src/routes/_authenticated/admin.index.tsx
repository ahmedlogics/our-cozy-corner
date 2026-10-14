import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowUp, Bike, CheckCircle2, Clock, Minus, Package, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashCard, ErrorState } from "@/components/shared/States";
import { AdminTableSkeleton, StatCard } from "@/components/shared/AdminBits";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { adminNav, adminStatsQuery } from "@/features/admin/admin";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin overview — LogiPulse" },
      { name: "description", content: "Live delivery metrics computed from real LogiPulse orders." },
      { property: "og:title", content: "Admin overview — LogiPulse" },
      { property: "og:description", content: "Live delivery metrics computed from real LogiPulse orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Overview,
});

function Overview() {
  useOrdersRealtime([["admin"]]);
  const q = useQuery(adminStatsQuery);
  return (
    <DashboardShell role="Admin" title="Overview" items={adminNav("overview")}>
      {q.isLoading ? <AdminTableSkeleton rows={5} /> : q.isError || !q.data ? <ErrorState description={(q.error as Error)?.message ?? "Couldn't load stats"} /> : (() => {
        const s = q.data;
        return (
          <>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Right now</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard index={0} label="Pending orders" value={s.pending} hint="Waiting for a rider" icon={Clock} tone="warning" />
                <StatCard index={1} label="Active deliveries" value={s.active} hint="Accepted, picked up or in transit" icon={Activity} />
                <StatCard index={2} label="Active riders" value={s.active_riders} hint={`of ${s.total_riders} registered`} icon={Bike} tone="success" />
                <StatCard index={3} label="Orders today" value={s.orders_today} icon={Package} />
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Open orders by priority</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard index={0} label="Normal" value={s.open_normal} hint={`${s.all_normal} all-time`} icon={Minus} />
                <StatCard index={1} label="High" value={s.open_high} hint={`${s.all_high} all-time`} icon={ArrowUp} tone="warning" />
                <StatCard index={2} label="Urgent" value={s.open_urgent} hint={`${s.all_urgent} all-time`} icon={AlertTriangle} tone="destructive" />
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">All-time</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard index={0} label="Total orders" value={s.total_orders} icon={Package} />
                <StatCard index={1} label="Delivered" value={s.delivered} icon={CheckCircle2} tone="success" />
                <StatCard index={2} label="Customers" value={s.total_customers} icon={Users} />
                <StatCard index={3} label="Riders" value={s.total_riders} icon={Bike} />
              </div>
            </section>
            <DashCard title="Orders per day" description="Last 14 days">
              <ChartContainer config={{ orders: { label: "Orders", color: "var(--primary)" } }} className="h-64 w-full">
                <BarChart data={s.daily.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString("en-PK", { day: "numeric", month: "short" }) }))}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </DashCard>
          </>
        );
      })()}
    </DashboardShell>
  );
}
