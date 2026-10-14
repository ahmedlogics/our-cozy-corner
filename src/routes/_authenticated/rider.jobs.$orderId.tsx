import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Package, User, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, DashCard, ErrorState } from "@/components/shared/States";
import { CareTag, ProgressBar, StatusBadge, StatusTimeline } from "@/components/shared/OrderBits";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { ChatPanel } from "@/components/shared/ChatPanel";
import { Button } from "@/components/ui/button";
import { riderNav } from "@/features/rider/nav";
import { NEXT_STATUS, STATUS_LABEL, orderCustomerQuery, orderQuery, profileQuery, updateOrderStatus } from "@/features/orders/orders";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/rider/jobs/$orderId")({
  head: () => ({
    meta: [
      { title: "Active delivery — LogiPulse rider" },
      { name: "description", content: "Pickup, drop-off and next step for your delivery." },
      { property: "og:title", content: "Active delivery — LogiPulse rider" },
      { property: "og:description", content: "Pickup, drop-off and next step for your delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const d = await context.queryClient.ensureQueryData(orderQuery(params.orderId));
    if (!d.order) throw notFound();
  },
  pendingComponent: () => <DashboardShell role="Rider" title="Delivery" items={riderNav("jobs")}><CardSkeleton rows={5} /></DashboardShell>,
  errorComponent: ({ error }) => <div className="p-8"><ErrorState description={(error as Error).message} /></div>,
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
      toast.success(next.status === "DELIVERED" ? "Delivery complete — great work!" : `${STATUS_LABEL[next.status]} recorded`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await Promise.all([qc.invalidateQueries({ queryKey: ["orders"] }), qc.invalidateQueries({ queryKey: ["rider"] })]);
      setBusy(false);
    }
  };

  return (
    <DashboardShell role="Rider" title="Active delivery" items={riderNav("jobs")}>
      <Link to="/rider/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> My jobs</Link>
      <section className="animate-enter rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} /><PriorityBadge priority={o.priority} />{o.handle_with_care && <CareTag />}
          <span className="ml-auto font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="mt-4"><ProgressBar status={o.status} /></div>
        {next ? (
          <Button variant="hero" size="lg" className="mt-5 w-full sm:w-auto" disabled={busy} onClick={advance}>
            {busy && <Loader2 className="animate-spin" />} {next.label}
          </Button>
        ) : o.status === "DELIVERED" ? (
          <p className="animate-enter mt-5 flex items-center gap-2 text-sm font-semibold text-success"><PartyPopper className="animate-pop size-5" /> Delivered — nice job!</p>
        ) : null}
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <DashCard title="Route">
            <div className="space-y-4 text-sm">
              <div className="flex gap-3"><MapPin className="mt-0.5 size-4 text-primary" /><div><p className="font-medium">Pickup</p><p>{o.pickup_address}</p></div></div>
              <div className="flex gap-3"><MapPin className="mt-0.5 size-4 text-accent" /><div><p className="font-medium">Drop-off</p><p>{o.dropoff_address}</p></div></div>
              <div className="flex gap-3"><User className="mt-0.5 size-4 text-muted-foreground" /><div><p className="font-medium">Recipient</p><p>{o.recipient_name} · <a className="text-primary hover:underline" href={`tel:${o.recipient_phone}`}>{o.recipient_phone}</a></p></div></div>
              <div className="flex gap-3"><Package className="mt-0.5 size-4 text-muted-foreground" /><div><p className="font-medium">Parcel</p><p className="text-muted-foreground">{o.parcel_description}</p></div></div>
            </div>
          </DashCard>
          <DashCard title={`Chat with ${customer.data?.full_name ?? "customer"}`}>
            <ChatPanel orderId={o.id} status={o.status} riderId={o.rider_id} meId={me.data?.id ?? ""} otherName={customer.data?.full_name ?? "Customer"} />
          </DashCard>
        </div>
        <DashCard title="Progress"><StatusTimeline order={o} events={data.events} /></DashCard>
      </div>
    </DashboardShell>
  );
}
