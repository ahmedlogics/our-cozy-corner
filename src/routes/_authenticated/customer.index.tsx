import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Package, PackagePlus, Activity, CheckCircle2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/shared/States";
import { OrderCard } from "@/components/shared/OrderBits";
import { Button } from "@/components/ui/button";
import { customerNav } from "@/features/customer/nav";
import { ACTIVE_STATUSES, myOrdersQuery, profileQuery } from "@/features/orders/orders";

function CustomerErrorComponent({ error }: { error: unknown }) {
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

export const Route = createFileRoute("/_authenticated/customer/")({
  head: () => ({
    meta: [
      { title: "Customer dashboard — LogiPulse" },
      { name: "description", content: "Book and manage your within-city deliveries in Karachi." },
      { property: "og:title", content: "Customer dashboard — LogiPulse" },
      { property: "og:description", content: "Book and manage your within-city deliveries in Karachi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(myOrdersQuery)]),
  pendingComponent: () => (
    <DashboardShell role="Customer" title="Overview" items={customerNav("overview")}>
      <CardSkeleton rows={1} /><div className="grid gap-4 sm:grid-cols-3"><CardSkeleton rows={1} /><CardSkeleton rows={1} /><CardSkeleton rows={1} /></div><CardSkeleton rows={4} />
    </DashboardShell>
  ),
  errorComponent: CustomerErrorComponent,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
  component: Overview,
});

function Overview() {
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: orders } = useSuspenseQuery(myOrdersQuery);
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const done = orders.filter((o) => o.status === "DELIVERED").length;
  const stats = [
    { label: "Total orders", value: orders.length, icon: Package },
    { label: "Active deliveries", value: active, icon: Activity },
    { label: "Completed", value: done, icon: CheckCircle2 },
  ];
  return (
    <DashboardShell role="Customer" title="Overview" items={customerNav("overview")}>
      <section className="animate-enter flex flex-col gap-4 rounded-3xl border border-border bg-gradient-surface p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Assalam-o-Alaikum,</p>
          <h2 className="text-2xl font-bold">{profile.full_name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Send a parcel anywhere within Karachi.</p>
        </div>
        <Button asChild variant="hero" size="lg"><Link to="/customer/book"><PackagePlus /> New delivery</Link></Button>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s, i) => (
          <div key={s.label} className="animate-enter rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/40" style={{ animationDelay: `${(i + 1) * 70}ms` }}>
            <s.icon className="size-5 text-primary" />
            <p className="mt-3 text-3xl font-bold tabular-nums">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent orders</h2>
          {orders.length > 0 && <Link to="/customer/orders" className="text-sm text-primary hover:underline">View all</Link>}
        </div>
        {orders.length === 0 ? (
          <EmptyState icon={Package} title="No deliveries yet" description="Book your first within-city delivery and track it here." action={<Button asChild variant="hero"><Link to="/customer/book">Book a delivery</Link></Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{orders.slice(0, 4).map((o, i) => <OrderCard key={o.id} order={o} index={i} />)}</div>
        )}
      </section>
    </DashboardShell>
  );
}
