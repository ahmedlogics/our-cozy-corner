import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/shared/States";
import { OrderCard, StatusBadge, VehicleIcon } from "@/components/shared/OrderBits";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { customerNav } from "@/features/customer/nav";
import { ACTIVE_STATUSES, formatPKR, myOrdersQuery } from "@/features/orders/orders";

type Tab = "all" | "active" | "delivered";

function CustomerOrdersErrorComponent({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <div className="p-8">
      <ErrorState description={(error as Error).message} />
      <Button className="mt-4" onClick={() => router.invalidate()}>
        Retry
      </Button>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/customer/orders/")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => (s["tab"] === "active" || s["tab"] === "delivered" ? { tab: s["tab"] } : {}),
  head: () => ({
    meta: [
      { title: "My orders — LogiPulse" },
      { name: "description", content: "All your LogiPulse deliveries, active and delivered." },
      { property: "og:title", content: "My orders — LogiPulse" },
      { property: "og:description", content: "All your LogiPulse deliveries, active and delivered." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myOrdersQuery),
  pendingComponent: () => <DashboardShell role="Customer" title="My orders" items={customerNav("orders")}><CardSkeleton rows={5} /></DashboardShell>,
  errorComponent: CustomerOrdersErrorComponent,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
  component: Orders,
});

function Orders() {
  const { tab = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: "/customer/orders/" });
  const { data } = useSuspenseQuery(myOrdersQuery);
  const list = data.filter((o) => (tab === "active" ? ACTIVE_STATUSES.includes(o.status) : tab === "delivered" ? o.status === "DELIVERED" : true));
  const tabs: { k: Tab; label: string }[] = [{ k: "all", label: "All" }, { k: "active", label: "Active" }, { k: "delivered", label: "Delivered" }];
  return (
    <DashboardShell role="Customer" title="My orders" items={customerNav("orders")}>
      <div className="inline-flex rounded-xl border border-border bg-card p-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => navigate({ search: { tab: t.k } })}
            className={cn("rounded-lg px-4 py-1.5 text-sm transition-colors", tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Package} title={tab === "all" ? "No orders yet" : `No ${tab} orders`} description="Your deliveries will show up here." action={<Button asChild variant="hero"><Link to="/customer/book">Book a delivery</Link></Button>} />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">{list.map((o, i) => <OrderCard key={o.id} order={o} index={i} />)}</div>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="p-3">Delivery</th><th className="p-3">Status</th><th className="p-3">Priority</th><th className="p-3">Date</th><th className="p-3 text-right">Fare</th></tr>
              </thead>
              <tbody>
                {list.map((o, i) => (
                  <tr key={o.id} className="animate-enter cursor-pointer border-t border-border transition-colors hover:bg-secondary/30" style={{ animationDelay: `${i * 40}ms` }}
                    onClick={() => navigate({ to: "/customer/orders/$orderId", params: { orderId: o.id } })}>
                    <td className="p-3"><div className="flex items-center gap-3"><VehicleIcon v={o.vehicle_type} className="size-4 text-primary" /><div className="min-w-0"><p className="max-w-xs truncate font-medium">{o.dropoff_address}</p><p className="max-w-xs truncate text-xs text-muted-foreground">from {o.pickup_address}</p></div></div></td>
                    <td className="p-3"><StatusBadge status={o.status} /></td>
                    <td className="p-3"><PriorityBadge priority={o.priority} /></td>
                    <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-PK", { dateStyle: "medium" })}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{formatPKR(o.total_fare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
