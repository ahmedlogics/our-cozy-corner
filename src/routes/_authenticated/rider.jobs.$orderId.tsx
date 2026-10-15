import { useState } from "react";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { isUserRider } from "@/features/auth/roles";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  PartyPopper,
  Phone,
  ShieldCheck,
  Truck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, DashCard, ErrorState } from "@/components/shared/States";
import { CareTag, ProgressBar, StatusBadge, StatusTimeline, VehicleIcon } from "@/components/shared/OrderBits";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { ChatPanel } from "@/components/shared/ChatPanel";
import { DeliveryRouteMap } from "@/components/shared/DeliveryRouteMap";
import { Button } from "@/components/ui/button";
import { riderNav } from "@/features/rider/nav";
import {
  NEXT_STATUS,
  STATUS_LABEL,
  formatPKR,
  orderCustomerQuery,
  orderQuery,
  profileQuery,
  updateOrderStatus,
} from "@/features/orders/orders";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/rider/jobs/$orderId")({
  head: () => ({
    meta: [
      { title: "Active delivery — LogiPulse rider" },
      { name: "description", content: "Pickup, drop-off, route map and live chat for your delivery." },
      { property: "og:title", content: "Active delivery — LogiPulse rider" },
      { property: "og:description", content: "Pickup, drop-off, route map and live chat for your delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const allowed = await isUserRider();
    if (!allowed) {
      throw redirect({ to: "/customer" });
    }
  },
  loader: async ({ context, params }) => {
    const d = await context.queryClient.ensureQueryData(orderQuery(params.orderId));
    if (!d.order) throw notFound();
  },
  pendingComponent: () => (
    <DashboardShell role="Rider" title="Delivery" items={riderNav("jobs")}>
      <CardSkeleton rows={5} />
    </DashboardShell>
  ),
  errorComponent: ({ error }) => (
    <DashboardShell role="Rider" title="Delivery" items={riderNav("jobs")}>
      <div className="space-y-4">
        <ErrorState description={(error as Error).message} />
      </div>
    </DashboardShell>
  ),
  notFoundComponent: () => (
    <DashboardShell role="Rider" title="Delivery" items={riderNav("jobs")}>
      <ErrorState title="Order not found" description="This order isn't assigned to you." />
    </DashboardShell>
  ),
  component: ActiveDelivery,
});

function ActiveDelivery() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(orderQuery(orderId));
  useOrdersRealtime([["orders"], ["rider"]]);
  const me = useQuery(profileQuery);
  const customer = useQuery(orderCustomerQuery(orderId));
  const [busy, setBusy] = useState(false);
  const o = data.order!;
  const next = NEXT_STATUS[o.status];

  const advance = async () => {
    if (!next) return;
    setBusy(true);
    try {
      await updateOrderStatus(o.id, next.status);
      if (next.status === "DELIVERED") {
        toast.success("Delivery completed! Customer and Admin have been notified.");
      } else {
        toast.success(`Status updated: ${STATUS_LABEL[next.status]}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: ["rider"] }),
      ]);
      setBusy(false);
    }
  };

  const isDelivered = o.status === "DELIVERED";

  return (
    <DashboardShell role="Rider" title="Active delivery" items={riderNav("jobs")}>
      {/* Navigation breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/rider/jobs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" /> Back to My jobs
        </Link>
        <span className="font-mono text-xs font-semibold text-muted-foreground">
          #{o.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Main Order Header & Lifecycle Status */}
      <section className="animate-enter rounded-3xl border border-border bg-card p-6 shadow-soft space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            <PriorityBadge priority={o.priority} />
            {o.handle_with_care && <CareTag />}
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
              <VehicleIcon v={o.vehicle_type} className="size-3.5 text-primary" />
              <span>{o.vehicle_type === "CARGO" ? "Cargo" : "Bike"}</span>
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Earnings</span>
            <p className="text-2xl font-black text-primary tabular-nums">{formatPKR(o.total_fare)}</p>
          </div>
        </div>

        <div>
          <ProgressBar status={o.status} />
        </div>

        {/* Step Progression Action Bar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-border/60">
          <div className="text-xs text-muted-foreground">
            {o.status === "ACCEPTED" && "Next step: Reach pickup location and collect the parcel."}
            {o.status === "PICKED_UP" && "Next step: Start traveling towards the drop-off destination."}
            {o.status === "IN_TRANSIT" && "Next step: Hand over the parcel to recipient and mark as completed."}
            {isDelivered && "This delivery is completed and finalized."}
          </div>

          {next ? (
            <Button
              variant={next.status === "DELIVERED" ? "default" : "hero"}
              size="lg"
              className={`w-full sm:w-auto font-bold shadow-md ${
                next.status === "DELIVERED" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
              }`}
              disabled={busy}
              onClick={advance}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : next.status === "DELIVERED" ? (
                <CheckCircle2 className="size-4 mr-1.5" />
              ) : (
                <Navigation className="size-4 mr-1.5" />
              )}
              {next.status === "PICKED_UP" && "Confirm Pickup from Customer"}
              {next.status === "IN_TRANSIT" && "Start Transit to Drop-off"}
              {next.status === "DELIVERED" && "Mark Order as Complete (Delivered)"}
            </Button>
          ) : isDelivered ? (
            <div className="animate-enter flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-500">
              <PartyPopper className="size-5" />
              <span>Delivery Completed Successfully!</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Interactive Delivery Map */}
      <section className="animate-enter space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Navigation className="size-4 text-primary" /> Delivery Route & Map
          </h2>
          <span className="text-xs text-muted-foreground">
            {o.distance_km ? `${Number(o.distance_km).toFixed(1)} km estimated trip` : "Karachi city route"}
          </span>
        </div>
        <DeliveryRouteMap
          pickup={{ lat: Number(o.pickup_lat), lng: Number(o.pickup_lng), address: o.pickup_address }}
          dropoff={{ lat: Number(o.dropoff_lat), lng: Number(o.dropoff_lng), address: o.dropoff_address }}
          status={o.status}
        />
      </section>

      {/* Main Grid: Details + Live Chat */}
      <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
        <div className="space-y-6">
          {/* Pickup and Dropoff Details */}
          <DashCard title="Delivery Locations & Recipient">
            <div className="space-y-4 text-sm">
              {/* Pickup info */}
              <div className="flex gap-3 items-start">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-500">
                  <MapPin className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">Pickup Location</p>
                  <p className="font-semibold text-foreground">{o.pickup_address}</p>
                </div>
              </div>

              {/* Drop-off destination */}
              <div className="flex gap-3 items-start">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-500">
                  <MapPin className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-500">Drop-off Destination</p>
                  <p className="font-semibold text-foreground">{o.dropoff_address}</p>
                </div>
              </div>

              {/* Recipient Details & Quick Call */}
              <div className="flex gap-3 items-start pt-2 border-t border-border/50">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <User className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recipient</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                    <p className="font-semibold text-foreground">{o.recipient_name}</p>
                    <a
                      href={`tel:${o.recipient_phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Phone className="size-3.5" />
                      <span>{o.recipient_phone}</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Parcel description */}
              <div className="flex gap-3 items-start pt-2 border-t border-border/50">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                  <Package className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parcel Description</p>
                  <p className="text-foreground text-xs">{o.parcel_description}</p>
                </div>
              </div>
            </div>
          </DashCard>

          {/* Timeline */}
          <DashCard title="Tracking Events">
            <StatusTimeline order={o} events={data.events} />
          </DashCard>
        </div>

        {/* Live Chat with Customer */}
        <div className="space-y-6">
          <DashCard
            title={`Live Chat with ${customer.data?.full_name ?? "Customer"}`}
          >
            <div className="space-y-3">
              <div className="rounded-xl bg-secondary/50 p-2.5 text-xs text-muted-foreground flex items-center gap-2">
                <MessageSquare className="size-4 text-primary shrink-0" />
                <span>Coordinate pickup, arrival, and delivery instructions in real-time.</span>
              </div>
              <ChatPanel
                orderId={o.id}
                status={o.status}
                riderId={o.rider_id}
                meId={me.data?.id ?? ""}
                otherName={customer.data?.full_name ?? "Customer"}
              />
            </div>
          </DashCard>
        </div>
      </div>
    </DashboardShell>
  );
}
