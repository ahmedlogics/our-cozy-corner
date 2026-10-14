import { useState, useEffect } from "react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { isUserRider } from "@/features/auth/roles";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bike, Crosshair, Filter, Loader2, MapPin, Navigation, PackageOpen, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, DashCard, EmptyState, ErrorState } from "@/components/shared/States";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { VehicleIcon } from "@/components/shared/OrderBits";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { riderNav } from "@/features/rider/nav";
import { PRIORITY_LABEL, type Priority } from "@/features/priority/priority";
import { useOrdersRealtime } from "@/features/orders/realtime";
import { availableOrdersQuery, riderProfileQuery, acceptOrder, saveLocation, registerRider, RADII, type SortMode } from "@/features/rider/rider";
import { friendlyError } from "@/features/orders/orders";
import { cn } from "@/lib/utils";
import { findNearestKarachiArea } from "@/features/locations/karachi-areas";

function RiderErrorComponent({ error }: { error: unknown }) {
  const router = useRouter();
  const msg = (error as Error)?.message ?? String(error);
  return (
    <DashboardShell role="Rider" title="Nearby pickups" items={riderNav("nearby")}>
      <div className="space-y-4">
        <ErrorState description={msg} />
        <Button onClick={() => router.invalidate()}>Retry</Button>
      </div>
    </DashboardShell>
  );
}

export const Route = createFileRoute("/_authenticated/rider/")({
  head: () => ({
    meta: [
      { title: "Rider dashboard — LogiPulse" },
      { name: "description", content: "See nearby pickups ranked by distance, filter by priority, and accept delivery jobs in Karachi." },
      { property: "og:title", content: "Rider dashboard — LogiPulse" },
      { property: "og:description", content: "See nearby pickups ranked by distance, filter by priority, and accept delivery jobs in Karachi." },
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
  loader: ({ context }) => context.queryClient.ensureQueryData(riderProfileQuery),
  pendingComponent: () => (
    <DashboardShell role="Rider" title="Nearby pickups" items={riderNav("nearby")}>
      <CardSkeleton rows={2} />
      <CardSkeleton rows={4} />
    </DashboardShell>
  ),
  errorComponent: RiderErrorComponent,
  component: RiderDashboard,
});

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-PK", { dateStyle: "medium" });
}

function RiderDashboard() {
  const { data } = useSuspenseQuery(riderProfileQuery);
  const rider = data.rider;
  if (!rider) return <Onboarding name={data.name} />;
  return <Nearby rider={rider} />;
}

/* ---------------- Onboarding: become a rider ---------------- */

function Onboarding({ name }: { name: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<"BIKE" | "CARGO">("BIKE");
  const [busy, setBusy] = useState(false);

  const register = async () => {
    setBusy(true);
    try {
      await registerRider(vehicle);
      await qc.invalidateQueries({ queryKey: ["rider"] });
      toast.success(`You're in, ${name.split(" ")[0]}! Set your location to start seeing pickups.`);
      navigate({ to: "/rider" });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { v: "BIKE" as const, icon: Bike, title: "Bike rider", desc: "Standard parcels within the city." },
    { v: "CARGO" as const, icon: Truck, title: "Cargo rider", desc: "Handle With Care parcels that need extra room." },
  ];

  return (
    <DashboardShell role="Rider" title="Nearby pickups" items={riderNav("nearby")}>
      <section className="animate-enter mx-auto max-w-xl space-y-6 rounded-3xl border border-border bg-gradient-surface p-8 shadow-soft">
        <div>
          <h2 className="text-2xl font-bold">Become a LogiPulse rider</h2>
          <p className="mt-1 text-sm text-muted-foreground">Assalam-o-Alaikum, {name}. Choose your vehicle to join the rider network.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Vehicle type">
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={vehicle === o.v}
              onClick={() => setVehicle(o.v)}
              className={`rounded-2xl border p-5 text-left transition-colors ${vehicle === o.v ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
            >
              <o.icon className={`size-6 ${vehicle === o.v ? "text-primary" : "text-muted-foreground"}`} />
              <p className="mt-3 font-semibold">{o.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{o.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Your vehicle decides which pickups you see — the app only ever offers jobs your vehicle can carry.</p>
        <Button variant="hero" size="lg" className="w-full" onClick={register} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Start riding
        </Button>
      </section>
    </DashboardShell>
  );
}

/* ---------------- Nearby pickups ---------------- */

function Nearby({ rider }: { rider: Database["public"]["Tables"]["rider_profiles"]["Row"] }) {
  const qc = useQueryClient();
  useOrdersRealtime([["rider", "available"]]);
  const navigate = useNavigate();
  const [radius, setRadius] = useState<number>(5);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [sort, setSort] = useState<SortMode>("nearest");
  const [geoState, setGeoState] = useState<"idle" | "asking" | "denied">("idle");

  const hasLocation = rider.current_lat !== null && rider.current_lng !== null;
  const locKey = `${rider.current_lat},${rider.current_lng},${rider.location_updated_at ?? ""}`;

  const orders = useQuery({
    ...availableOrdersQuery(radius, priority, sort, locKey),
    enabled: hasLocation,
    refetchInterval: 30_000,
  });

  const save = async (lat: number, lng: number) => {
    try {
      await saveLocation(lat, lng, false);
      await qc.invalidateQueries({ queryKey: ["rider"] });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  // Automatically acquire real device GPS in the background on mount
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        save(+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6));
      },
      () => {
        // Fallback default if rider has never saved coordinates before
        if (!hasLocation) {
          save(24.856, 67.031);
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setGeoState("denied");
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (p) =>
        save(+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)).then(() => {
          setGeoState("idle");
          toast.success("Location updated from device GPS");
        }),
      () => {
        setGeoState("denied");
        toast.error("Location permission denied in browser");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const accept = async (id: string) => {
    try {
      await acceptOrder(id);
      await qc.invalidateQueries({ queryKey: ["rider"] });
      toast.success("Order accepted — chat with the customer is now open.");
      navigate({ to: "/rider/jobs/$orderId", params: { orderId: id } });
    } catch (err) {
      toast.error(friendlyError(err));
      qc.invalidateQueries({ queryKey: ["rider", "available"] });
    }
  };

  const nearestArea = hasLocation
    ? findNearestKarachiArea({ lat: rider.current_lat!, lng: rider.current_lng! })
    : null;
  const areaName = nearestArea?.name ?? "Karachi Central Hub";

  return (
    <DashboardShell role="Rider" title="Nearby pickups" items={riderNav("nearby")}>
      {/* Real-time Courier Status & Area Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-foreground">
                {areaName}, Karachi
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-500">
                <Navigation className="size-3" /> Live GPS Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Nearby pickups are automatically ranked by real distance from your position
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={useMyLocation}
          disabled={geoState === "asking"}
        >
          {geoState === "asking" ? <Loader2 className="size-3.5 animate-spin" /> : <Crosshair className="size-3.5 text-primary" />}
          {geoState === "asking" ? "Acquiring GPS..." : "Update Location"}
        </Button>
      </div>

      {/* Compact Filter Toolbar with Inline Dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Filter className="size-3.5 text-primary" />
            <span>Filter pickups:</span>
          </div>

          {/* Radius Dropdown */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground text-[11px]">Radius:</span>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="h-8 rounded-xl border border-border bg-secondary/50 px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary transition-colors"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>{r} km radius</option>
              ))}
            </select>
          </div>

          {/* Priority Dropdown */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground text-[11px]">Priority:</span>
            <select
              value={priority ?? "ALL"}
              onChange={(e) => setPriority(e.target.value === "ALL" ? null : (e.target.value as Priority))}
              className="h-8 rounded-xl border border-border bg-secondary/50 px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary transition-colors"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">🚨 Urgent Only</option>
              <option value="HIGH">⚡ High Priority</option>
              <option value="NORMAL">Standard Only</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground text-[11px]">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="h-8 rounded-xl border border-border bg-secondary/50 px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary transition-colors"
            >
              <option value="nearest">Nearest first</option>
              <option value="priority">Priority first</option>
            </select>
          </div>
        </div>

        {/* Vehicle matching indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 rounded-lg bg-secondary/70 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            <VehicleIcon v={rider.vehicle_type} className="size-3.5 text-primary" />
            <span>Showing {rider.vehicle_type === "CARGO" ? "cargo" : "bike"} orders</span>
          </span>
        </div>
      </div>

      {/* Nearby orders */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">
            Pickups within {radius} km{priority ? ` · ${PRIORITY_LABEL[priority]}` : ""}
          </h2>
          <span className="text-xs text-muted-foreground">
            {orders.data?.length ?? 0} available {orders.data?.length === 1 ? "delivery" : "deliveries"}
          </span>
        </div>

        {!hasLocation ? (
          <EmptyState icon={MapPin} title="Set your location first" description="Allow browser location access or tap update location above." />
        ) : orders.isLoading ? (
          <CardSkeleton rows={3} />
        ) : orders.isError ? (
          <ErrorState description={(orders.error as Error).message} />
        ) : (orders.data?.length ?? 0) === 0 ? (
          <EmptyState icon={PackageOpen} title="No pickups nearby right now" description="New orders land here automatically — check again in a bit, or widen the radius." />
        ) : (
          <ul className="grid gap-3.5">
            {orders.data!.map((o, i) => {
              const isUrgent = o.priority === "URGENT";
              const isHigh = o.priority === "HIGH";

              return (
                <li
                  key={o.id}
                  className={cn(
                    "animate-enter rounded-2xl border p-4 sm:p-5 shadow-soft transition-all hover:border-primary/50",
                    isUrgent
                      ? "border-rose-500/60 bg-rose-500/[0.04] ring-1 ring-rose-500/30 hover:bg-rose-500/[0.07]"
                      : isHigh
                      ? "border-amber-500/50 bg-amber-500/[0.04] ring-1 ring-amber-500/25 hover:bg-amber-500/[0.07]"
                      : "border-border bg-card hover:bg-secondary/15"
                  )}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {/* Top Bar: Order ID, Distance from rider, Priority */}
                  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold tracking-wide text-foreground">
                        Order #{o.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="inline-flex items-center gap-1 font-bold text-primary">
                        <MapPin className="size-3.5" />
                        {Number(o.pickup_distance_km).toFixed(1)} km from your location
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isUrgent && (
                        <span className="relative flex h-2 w-2" title="Peak hours urgent dispatch">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                        </span>
                      )}
                      <PriorityBadge priority={o.priority} />
                    </div>
                  </div>

                  {/* Main Grid: Route & Parcel on Left, Fare & Action on Right */}
                  <div className="grid gap-4 md:grid-cols-[1fr_210px] items-center">
                    {/* Left: Connected Route Timeline (Pickup -> Dropoff) */}
                    <div className="space-y-2.5">
                      <div className="space-y-1.5 rounded-xl border border-border/70 bg-secondary/20 p-3">
                        {/* Pickup Stop */}
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
                            <span className="size-2 rounded-full bg-emerald-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Pickup Location</span>
                            <p className="text-xs font-semibold text-foreground truncate">{o.pickup_address}</p>
                          </div>
                        </div>

                        {/* Route Distance Line */}
                        <div className="ml-2.5 pl-3 border-l-2 border-dashed border-border py-0.5 text-[10px] text-muted-foreground font-medium">
                          {o.trip_distance_km ? `Trip route: ~${Number(o.trip_distance_km).toFixed(1)} km delivery` : "Direct route delivery"}
                        </div>

                        {/* Drop-off Stop */}
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent/20 text-accent">
                            <Navigation className="size-3 text-accent" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">Drop-off Destination</span>
                            <p className="text-xs font-semibold text-foreground truncate">{o.dropoff_address || "Karachi Destination"}</p>
                          </div>
                        </div>
                      </div>

                      {/* Package Summary & Details */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-0.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-2 py-0.5 font-medium text-foreground">
                          <VehicleIcon v={o.vehicle_type} className="size-3 text-primary" />
                          <span>{o.vehicle_type === "CARGO" ? "Cargo" : "Bike"}</span>
                        </span>
                        <span className="truncate max-w-xs">{o.parcel_summary}</span>
                        {o.handle_with_care && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <ShieldCheck className="size-3" /> Handle with care
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground ml-auto">posted {timeAgo(o.created_at)}</span>
                      </div>
                    </div>

                    {/* Right: Job Payout / Fare & Accept Button */}
                    <div className="flex flex-col items-end justify-center gap-2.5 border-t border-border/50 pt-3 md:border-t-0 md:border-l md:border-border/60 md:pl-4 md:pt-0">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Guaranteed Payout</span>
                        <p className="text-2xl font-black tabular-nums text-primary">
                          {o.total_fare ? `Rs. ${o.total_fare}` : "Rs. Fare"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {Number(o.pickup_distance_km).toFixed(1)} km to pickup
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant={isUrgent ? "default" : "hero"}
                        className={cn(
                          "w-full gap-1.5 font-bold text-xs h-9.5 shadow-soft",
                          isUrgent && "bg-rose-600 hover:bg-rose-700 text-white"
                        )}
                        onClick={() => accept(o.id)}
                      >
                        <span>Accept job</span>
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <p className="w-20 shrink-0 text-sm font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
