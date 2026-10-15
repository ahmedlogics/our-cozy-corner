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
  const msg = (error as Error)?.message ?? String(error);
  const isSchemaMissing = msg.includes("schema cache") || msg.includes("public.orders") || msg.includes("PGRST205");

  return (
    <DashboardShell role="Customer" title="Overview" items={customerNav("overview")}>
      <div className="space-y-4">
        {isSchemaMissing ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-200">
            <h3 className="text-lg font-semibold text-amber-300">Database Setup Required</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your Supabase project is connected, but the database tables have not been created yet in your project.
            </p>
            <div className="mt-4 rounded-xl bg-background/60 p-4 font-mono text-xs text-foreground">
              Open your Supabase SQL Editor and run the script in:
              <br />
              <strong className="text-primary">sql/0000_FULL_SETUP.sql</strong>
            </div>
            <Button className="mt-4" onClick={() => router.invalidate()}>
              I Have Run the SQL — Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ErrorState description={msg} />
            <Button onClick={() => router.invalidate()}>Retry</Button>
          </div>
        )}
      </div>
    </DashboardShell>
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
      <section className="animate-enter flex flex-col gap-4 rounded-3xl border border-[#E5EAE7] bg-white p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#087F75]">Customer Portal</span>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-[#14283F]">Welcome back, {profile.full_name}</h2>
          <p className="mt-1 text-sm text-[#617285]">Book, dispatch, and track connected deliveries across the city.</p>
        </div>
        <Button asChild variant="hero" size="lg" className="shadow-md">
          <Link to="/customer/book">
            <PackagePlus className="size-4 mr-1.5" />
            <span>Book New Delivery</span>
          </Link>
        </Button>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="animate-enter rounded-2xl border border-[#E5EAE7] bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-[#087F75]/40"
            style={{ animationDelay: `${(i + 1) * 70}ms` }}
          >
            <div className="grid size-10 place-items-center rounded-xl bg-[#E9F3EF] text-[#087F75]">
              <s.icon className="size-5" />
            </div>
            <p className="mt-4 font-display text-3xl font-extrabold text-[#14283F] tabular-nums">{s.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#617285]">{s.label}</p>
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
