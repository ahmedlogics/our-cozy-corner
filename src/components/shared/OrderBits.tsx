import { Link } from "@tanstack/react-router";
import { Bike, Truck, Check, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { STATUS_FLOW, STATUS_LABEL, formatPKR, progressOf, type Order, type OrderEvent, type OrderStatus } from "@/features/orders/orders";

const statusStyle: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border border-amber-200",
  ACCEPTED: "bg-blue-50 text-blue-700 border border-blue-200",
  PICKED_UP: "bg-teal-50 text-[#087F75] border border-teal-200 font-semibold",
  IN_TRANSIT: "bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold",
  DELIVERED: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold",
  CANCELLED: "bg-rose-50 text-rose-700 border border-rose-200",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs", statusStyle[status])}>{STATUS_LABEL[status]}</span>;
}

export function ProgressBar({ status }: { status: OrderStatus }) {
  const isComplete = status === "DELIVERED";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5EAE7]" role="progressbar" aria-valuenow={progressOf(status)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700",
          isComplete ? "bg-[#16A34A]" : "bg-[#087F75]"
        )}
        style={{ width: `${progressOf(status)}%` }}
      />
    </div>
  );
}

export const VehicleIcon = ({ v, className }: { v: string; className?: string }) => (v === "CARGO" ? <Truck className={className} /> : <Bike className={className} />);

export function OrderCard({ order, index = 0 }: { order: Order; index?: number }) {
  return (
    <Link
      to="/customer/orders/$orderId"
      params={{ orderId: order.id }}
      className="animate-enter block rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><VehicleIcon v={order.vehicle_type} className="size-5" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{order.dropoff_address}</p>
            <p className="truncate text-xs text-muted-foreground">from {order.pickup_address}</p>
          </div>
        </div>
        <p className="shrink-0 text-sm font-semibold">{formatPKR(order.total_fare)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <PriorityBadge priority={order.priority} />
        <span className="ml-auto text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      <div className="mt-3"><ProgressBar status={order.status} /></div>
    </Link>
  );
}

export function FareReceipt({
  distanceKm,
  vehicle,
  base,
  distance,
  care,
  loader,
  total,
  perKm,
}: {
  distanceKm: number | string;
  vehicle: string;
  base: number | string;
  distance: number | string;
  care: number | string;
  loader?: number | string | undefined;
  total: number | string;
  perKm?: number | string | undefined;
}) {
  const Row = ({ k, v, muted }: { k: string; v: string; muted?: boolean }) => (
    <div className={cn("flex justify-between py-1.5 text-sm", muted ? "text-muted-foreground" : "text-foreground")}>
      <span>{k}</span>
      <span className="tabular-nums font-mono">{v}</span>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <h4 className="text-sm font-bold tracking-tight text-foreground mb-2">Delivery Fare Breakdown</h4>
      <Row k="Vehicle" v={vehicle === "CARGO" ? "Cargo Van / Truck" : "Motorbike"} muted />
      <Row k="Direct Distance" v={`${Number(distanceKm).toFixed(2)} km`} muted />
      <div className="my-2.5 border-t border-border/70" />
      <Row k="Base fare" v={formatPKR(base)} />
      <Row k={perKm ? `Distance fare (${formatPKR(perKm)}/km)` : "Distance fare"} v={formatPKR(distance)} />
      {Number(care) > 0 && <Row k="Handle With Care Fee" v={formatPKR(care)} />}
      {Number(loader) > 0 && <Row k="Loader / Labour Fee" v={formatPKR(loader!)} />}
      <div className="my-2.5 border-t border-border" />
      <div className="flex justify-between text-lg font-bold text-foreground">
        <span>Total Fare</span>
        <span className="text-primary tabular-nums font-mono font-extrabold">{formatPKR(total)}</span>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Point-to-point calculation verified via Karachi service rules.</p>
    </div>
  );
}

export function StatusTimeline({ order, events }: { order: Order; events: OrderEvent[] }) {
  const reached = new Map(events.map((e) => [e.status, e]));
  const steps = order.status === "CANCELLED" ? [...STATUS_FLOW.slice(0, 1), "CANCELLED" as const] : STATUS_FLOW;
  const cur = steps.indexOf(order.status);
  return (
    <ol>
      {steps.map((s, i) => {
        const ev = reached.get(s);
        const done = i <= cur;
        const last = i === steps.length - 1;
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 overflow-hidden rounded-full bg-border" aria-hidden>
                <span className="block w-full bg-primary transition-[height] duration-700 ease-out" style={{ height: i < cur ? "100%" : "0%", transitionDelay: `${i * 120}ms` }} />
              </span>
            )}
            <div className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full border text-xs transition-colors duration-500", done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground", i === cur && order.status !== "DELIVERED" && "ring-4 ring-primary/20")}>
              {done ? <Check key={`${s}-done`} className="animate-pop size-4" /> : <Clock className="size-3.5" />}
            </div>
            <div>
              <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>{STATUS_LABEL[s]}</p>
              {ev && <p className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}{ev.note ? ` · ${ev.note}` : ""}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const CareTag = () => <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent"><ShieldCheck className="size-3.5" />Handle With Care</span>;
