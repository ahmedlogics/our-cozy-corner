import { Link } from "@tanstack/react-router";
import { Bike, Truck, Check, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { STATUS_FLOW, STATUS_LABEL, formatPKR, progressOf, type Order, type OrderEvent, type OrderStatus } from "@/features/orders/orders";

const statusStyle: Record<OrderStatus, string> = {
  PENDING: "bg-warning/15 text-warning",
  ACCEPTED: "bg-primary/15 text-primary",
  PICKED_UP: "bg-primary/15 text-primary",
  IN_TRANSIT: "bg-primary/15 text-primary",
  DELIVERED: "bg-success/15 text-success",
  CANCELLED: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", statusStyle[status])}>{STATUS_LABEL[status]}</span>;
}

export function ProgressBar({ status }: { status: OrderStatus }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={progressOf(status)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${progressOf(status)}%` }} />
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

export function FareReceipt({ distanceKm, vehicle, base, distance, care, total, perKm }: { distanceKm: number | string; vehicle: string; base: number | string; distance: number | string; care: number | string; total: number | string; perKm?: number | string | undefined }) {
  const Row = ({ k, v, muted }: { k: string; v: string; muted?: boolean }) => (
    <div className={cn("flex justify-between py-1.5 text-sm", muted && "text-muted-foreground")}><span>{k}</span><span className="tabular-nums">{v}</span></div>
  );
  return (
    <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-4 font-mono">
      <Row k="Vehicle" v={vehicle} muted />
      <Row k="Straight-line distance" v={`${Number(distanceKm).toFixed(2)} km`} muted />
      <div className="my-2 border-t border-dashed border-border" />
      <Row k="Base fare" v={formatPKR(base)} />
      <Row k={perKm ? `Distance fare (${formatPKR(perKm)}/km)` : "Distance fare"} v={formatPKR(distance)} />
      <Row k="Handle With Care" v={Number(care) > 0 ? formatPKR(care) : "—"} />
      <div className="my-2 border-t border-dashed border-border" />
      <div className="flex justify-between text-base font-bold"><span>Total</span><span className="tabular-nums">{formatPKR(total)}</span></div>
      <p className="mt-2 font-sans text-xs text-muted-foreground">Distance is measured point-to-point, not by road.</p>
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
