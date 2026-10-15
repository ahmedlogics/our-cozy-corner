import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, User, CheckCircle2, PhoneCall, ShieldCheck, MessageSquare } from "lucide-react";
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
import { DeliveryRouteMap } from "@/components/shared/DeliveryRouteMap";

function OrderDetailErrorComponent({ error }: { error: unknown }) {
  const router = useRouter();
  const msg = (error as Error)?.message ?? String(error);
  return (
    <DashboardShell role="Customer" title="Order details" items={customerNav("orders")}>
      <div className="space-y-4">
        <ErrorState description={msg} />
        <Button onClick={() => router.invalidate()}>Retry</Button>
      </div>
    </DashboardShell>
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
          <DashCard title="Route & Navigation">
            {o.pickup_lat && o.pickup_lng && o.dropoff_lat && o.dropoff_lng && (
              <div className="mb-4">
                <DeliveryRouteMap
                  pickup={{ lat: Number(o.pickup_lat), lng: Number(o.pickup_lng), address: o.pickup_address }}
                  dropoff={{ lat: Number(o.dropoff_lat), lng: Number(o.dropoff_lng), address: o.dropoff_address }}
                  status={o.status}
                />
              </div>
            )}
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
              <div className="animate-enter space-y-4">
                {/* Rider Header with Avatar & Name */}
                <div className="flex items-center gap-3">
                  <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-glow">
                    <VehicleIcon v={rider.data.vehicle_type} className="size-6" />
                    <span className="absolute -bottom-0.5 -right-0.5 flex size-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex size-3 rounded-full bg-success" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-base font-bold text-foreground">{rider.data.full_name}</p>
                      <ShieldCheck className="size-4 shrink-0 text-success" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      LogiPulse Verified Courier Partner
                    </p>
                  </div>
                </div>

                {/* Pakistani Number Plate Display */}
                <div className="rounded-2xl border border-border bg-gradient-to-r from-card to-secondary/40 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Vehicle Type
                      </span>
                      <p className="text-xs font-semibold text-foreground">
                        {rider.data.vehicle_type === "CARGO" ? "Cargo Van / Loader" : "Motorbike (70cc / 125cc)"}
                      </p>
                    </div>

                    {/* Styled License Plate */}
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-primary/40 bg-background/90 px-3 py-1 shadow-sm">
                      <span className="text-[8px] font-bold tracking-widest text-muted-foreground uppercase">
                        SINDH
                      </span>
                      <span className="font-mono text-xs font-extrabold tracking-wider text-primary">
                        {rider.data.plate_number || "KHI-9842"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Phone & Actions */}
                <div className="space-y-2.5 border-t border-border pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Rider Contact:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {rider.data.phone || "+92 300 1234567"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button asChild size="sm" variant="hero" className="w-full text-xs">
                      <a href={`tel:${rider.data.phone || "+923001234567"}`}>
                        <PhoneCall className="mr-1.5 size-3.5" /> Call Rider
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => {
                        const chatInput = document.querySelector<HTMLInputElement>('input[aria-label="Message"]');
                        if (chatInput) {
                          chatInput.focus();
                          chatInput.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                      }}
                    >
                      <MessageSquare className="mr-1.5 size-3.5 text-primary" /> Live Chat
                    </Button>
                  </div>
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
