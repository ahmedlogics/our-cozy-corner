import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { isUserRider } from "@/features/auth/roles";
import { MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, DashCard, EmptyState, ErrorState } from "@/components/shared/States";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { StatusBadge, VehicleIcon, ProgressBar } from "@/components/shared/OrderBits";
import { Button } from "@/components/ui/button";
import { riderNav } from "@/features/rider/nav";
import { useOrdersRealtime } from "@/features/orders/realtime";
import { riderJobsQuery } from "@/features/rider/rider";
import { ACTIVE_STATUSES, formatPKR, type Order } from "@/features/orders/orders";

export const Route = createFileRoute("/_authenticated/rider/jobs/")({
  head: () => ({
    meta: [
      { title: "My jobs — LogiPulse rider" },
      { name: "description", content: "Track the deliveries you've accepted, from pickup to drop-off." },
      { property: "og:title", content: "My jobs — LogiPulse rider" },
      { property: "og:description", content: "Track the deliveries you've accepted, from pickup to drop-off." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const allowed = await isUserRider();
    if (!allowed) {
      throw redirect({ to: "/customer" });
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(riderJobsQuery),
  pendingComponent: () => (
    <DashboardShell role="Rider" title="My jobs" items={riderNav("jobs")}>
      <CardSkeleton rows={3} />
    </DashboardShell>
  ),
  errorComponent: ({ error }) => (
    <DashboardShell role="Rider" title="My jobs" items={riderNav("jobs")}>
      <div className="space-y-4">
        <ErrorState description={(error as Error).message} />
      </div>
    </DashboardShell>
  ),
  component: MyJobs,
});

function MyJobs() {
  const { data: jobs } = useSuspenseQuery(riderJobsQuery);
  useOrdersRealtime([["rider"]]);
  const active = jobs.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const history = jobs.filter((o) => !ACTIVE_STATUSES.includes(o.status));

  return (
    <DashboardShell role="Rider" title="My jobs" items={riderNav("jobs")}>
      <JobList title="Active delivery" orders={active} empty={{ title: "No active delivery", description: "Accept a pickup from the Nearby pickups page and it will show up here." }} />
      {history.length > 0 && (
        <JobList title="History" orders={history} empty={null} />
      )}
    </DashboardShell>
  );
}

function JobList({ title, orders, empty }: { title: string; orders: Order[]; empty: { title: string; description: string } | null }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {orders.length === 0 ? (
        empty && <EmptyState icon={PackageCheck} title={empty.title} description={empty.description} action={<Button asChild variant="hero"><Link to="/rider">Find pickups</Link></Button>} />
      ) : (
        <ul className="grid gap-3">
          {orders.map((o, i) => <JobCard key={o.id} order={o} index={i} />)}
        </ul>
      )}
    </section>
  );
}

function JobCard({ order: o, index }: { order: Order; index: number }) {
  return (
    <li className="animate-enter" style={{ animationDelay: `${index * 60}ms` }}>
    <Link to="/rider/jobs/$orderId" params={{ orderId: o.id }} className="block rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><VehicleIcon v={o.vehicle_type} className="size-5" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold"><MapPin className="mr-1 inline size-3.5 text-primary" />{o.pickup_address}</p>
            <p className="truncate text-xs text-muted-foreground">to {o.dropoff_address}</p>
          </div>
        </div>
        <p className="shrink-0 text-sm font-semibold">{formatPKR(o.total_fare)}</p>
      </div>
      {(o.status === "ACCEPTED" || o.status === "PICKED_UP" || o.status === "IN_TRANSIT") && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Recipient: {o.recipient_name} · {o.recipient_phone}</span>
          {o.handle_with_care && <span className="inline-flex items-center gap-1 font-semibold text-primary"><ShieldCheck className="size-3" /> Handle with care</span>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={o.status} />
        <PriorityBadge priority={o.priority} />
        <span className="ml-auto text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      <div className="mt-3"><ProgressBar status={o.status} /></div>
    </Link>
    </li>
  );
}
