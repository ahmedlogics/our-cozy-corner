import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, User, CheckCircle2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, DashCard, ErrorState } from "@/components/shared/States";
import { CareTag, FareReceipt, ProgressBar, StatusBadge, StatusTimeline, VehicleIcon } from "@/components/shared/OrderBits";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { ChatPanel } from "@/components/shared/ChatPanel";
import { Button } from "@/components/ui/button";
import { customerNav } from "@/features/customer/nav";
import { orderQuery, orderRiderQuery, profileQuery } from "@/features/orders/orders";
import { useOrdersRealtime } from "@/features/orders/realtime";
import { DispatchRadar } from "@/components/shared/DispatchRadar";

function OrderDetailErrorComponent({ error }: { error: unknown }) {
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

export const Route = createFileRoute("/_authenticated/customer/orders/$orderId")({
  validateSearch: (s: Record<string, unknown>): { created?: boolean } => (s["created"] ? { created: true } : {}),
  head: () => ({
    meta: [
      { title: "Order details — LogiPulse" },
      { name: "description", content: "Track your delivery status and fare breakdown." },
      { property: "og:title", content: "Order details — LogiPulse" },
      { property: "og:description", content: "Track your delivery status and fare breakdown." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const d = await context.queryClient.ensureQueryData(orderQuery(params.orderId));
    if (!d.order) throw notFound();
  },
  pendingComponent: () => <DashboardShell role="Customer" title="Order" items={customerNav("orders")}><CardSkeleton rows={6} /></DashboardShell>,
  errorComponent: OrderDetailErrorComponent,
  notFoundComponent: () => (
    <DashboardShell role="Customer" title="Order" items={customerNav("orders")}>
      <ErrorState title="Order not found" description="This order doesn't exist or isn't yours." />
      <Button asChild variant="glass"><Link to="/customer/orders" search={{ tab: "all" }}>Back to orders</Link></Button>
    </DashboardShell>
  ),
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();
  const { created } = Route.useSearch();
  const { data } = useSuspenseQuery(orderQuery(orderId));
  useOrdersRealtime([["orders"]]);
  const o = data.order!;
  const rider = useQuery({ ...orderRiderQuery(orderId), enabled: !!o.rider_id });
  const me = useQuery(profileQuery);
  return (
    <DashboardShell role="Customer" title="Order details" items={customerNav("orders")}>
      <Link to="/customer/orders" search={{ tab: "all" }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All orders</Link>
      {created && o.status !== "PENDING" && (
        <div className="animate-enter flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
          <CheckCircle2 className="animate-pop size-8 text-success" />
          <div><p className="font-semibold">Rider Assigned</p><p className="text-sm text-muted-foreground">Your courier has accepted the delivery and is heading to the pickup point.</p></div>
        </div>
      )}

      {o.status === "PENDING" && (
        <div className="animate-enter">
          <DispatchRadar order={o} />
        </div>
      )}

      <section className="animate-enter rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} /><PriorityBadge priority={o.priority} />{o.handle_with_care && <CareTag />}
          <span className="ml-auto font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="mt-4"><ProgressBar status={o.status} /></div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <DashCard title="Tracking"><StatusTimeline order={o} events={data.events} /></DashCard>
          <DashCard title="Chat with your rider">
            <ChatPanel orderId={o.id} status={o.status} riderId={o.rider_id} meId={me.data?.id ?? ""} otherName={rider.data?.full_name ?? "Your rider"} />
          </DashCard>
          <DashCard title="Route">
            <div className="space-y-4 text-sm">
              <div className="flex gap-3"><MapPin className="mt-0.5 size-4 text-primary" /><div><p className="font-medium">Pickup</p><p>{o.pickup_address}</p></div></div>
              <div className="flex gap-3"><MapPin className="mt-0.5 size-4 text-accent" /><div><p className="font-medium">Drop-off</p><p>{o.dropoff_address}</p></div></div>
              <div className="flex gap-3"><User className="mt-0.5 size-4 text-muted-foreground" /><div><p className="font-medium">Recipient</p><p>{o.recipient_name} · {o.recipient_phone}</p><p className="text-muted-foreground">{o.parcel_description}</p></div></div>
            </div>
          </DashCard>
        </div>
        <div className="space-y-6">
          <DashCard title="Courier Status">
            {!o.rider_id ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-warning">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-warning" />
                  </span>
                  <span className="text-sm font-semibold">Broadcasting to Couriers</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Nearby courier riders within the search radius are currently receiving your pickup alert. Once a courier accepts, their vehicle details and direct live chat will unlock here.
                </p>
                <div className="rounded-xl border border-border/80 bg-secondary/30 p-2.5 text-[11px] text-muted-foreground">
                  Vehicle required: <span className="font-semibold text-foreground">{o.vehicle_type === "CARGO" ? "Cargo Van / Bulk" : "Motorbike"}</span>
                </div>
              </div>
            ) : rider.isLoading ? (
              <div className="h-12 animate-pulse rounded-xl bg-secondary" />
            ) : rider.data ? (
              <div className="animate-enter flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><VehicleIcon v={rider.data.vehicle_type} className="size-5" /></div>
                <div>
                  <p className="font-semibold">{rider.data.full_name}</p>
                  <p className="text-xs text-muted-foreground">{rider.data.vehicle_type === "CARGO" ? "Cargo vehicle" : "Bike"}{rider.data.plate_number ? ` · ${rider.data.plate_number}` : ""}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm">A rider has accepted your order.</p>
            )}
          </DashCard>
          <DashCard title="Fare receipt">
            <FareReceipt distanceKm={o.distance_km} vehicle={o.vehicle_type} base={o.base_fare} distance={o.distance_fare} care={o.care_fee} total={o.total_fare} />
          </DashCard>
        </div>
      </div>
    </DashboardShell>
  );
}
