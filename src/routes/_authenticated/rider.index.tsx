import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Crosshair, FlaskConical, Loader2, MapPin, PackageOpen, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, DashCard, EmptyState, ErrorState } from "@/components/shared/States";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { VehicleIcon } from "@/components/shared/OrderBits";
import { Button } from "@/components/ui/button";
import { riderNav } from "@/features/rider/nav";
import { PRIORITY_LABEL, type Priority } from "@/features/priority/priority";
import { availableOrdersQuery, riderProfileQuery, acceptOrder, saveLocation, RADII, type SortMode } from "@/features/rider/rider";
import { friendlyError } from "@/features/orders/orders";

/** Labeled demo spots inside the Karachi service area — never presented as the rider's real position. */
const DEMO_SPOTS = [
  { name: "Saddar", lat: 24.856, lng: 67.031 },
  { name: "Clifton", lat: 24.8138, lng: 67.0299 },
  { name: "Gulshan-e-Iqbal", lat: 24.92, lng: 67.099 },
  { name: "North Nazimabad", lat: 24.9425, lng: 67.04 },
] as const;

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
  loader: ({ context }) => context.queryClient.ensureQueryData(riderProfileQuery),
  pendingComponent: () => (
    <DashboardShell role="Rider" title="Nearby pickups" items={riderNav("nearby")}>
      <CardSkeleton rows={2} />
      <CardSkeleton rows={4} />
    </DashboardShell>
  ),
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <div className="p-8"><ErrorState description={(error as Error).message} /><Button className="mt-4" onClick={() => router.invalidate()}>Retry</Button></div>;
  },
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

function Nearby({ rider }: { rider: NonNullable<Awaited<ReturnType<typeof riderProfileQuery.queryFn>>>["rider"] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [radius, setRadius] = useState<number>(5);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [sort, setSort] = useState<SortMode>("nearest");
  const [geoState, setGeoState] = useState<"idle" | "asking" | "denied">("idle");
  const [savingSpot, setSavingSpot] = useState<string | null>(null);

  const hasLocation = rider.current_lat !== null && rider.current_lng !== null;
  const locKey = `${rider.current_lat},${rider.current_lng},${rider.location_updated_at ?? ""}`;

  const orders = useQuery({
    ...availableOrdersQuery(radius, priority, sort, locKey),
    enabled: hasLocation,
    refetchInterval: 30_000,
  });

  const save = async (lat: number, lng: number, demo: boolean, label?: string) => {
    if (demo) setSavingSpot(label ?? null);
    try {
      await saveLocation(lat, lng, demo);
      await qc.invalidateQueries({ queryKey: ["rider"] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSavingSpot(null);
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setGeoState("denied");
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => save(+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6), false).then(() => setGeoState("idle")),
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const accept = async (id: string) => {
    try {
      await acceptOrder(id);
      await qc.invalidateQueries({ queryKey: ["rider"] });
      toast.success("Order accepted — find it under My jobs.");
      navigate({ to: "/rider/jobs" });
    } catch (err) {
      toast.error(friendlyError(err));
      qc.invalidateQueries({ queryKey: ["rider", "available"] });
    }
  };

  return (
    <DashboardShell role="Rider" title="Nearby pickups" items={riderNav("nearby")}>
      {/* Location card */}
      <DashCard title="Your location" description="Nearby pickups are ranked by real distance from this point.">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {hasLocation ? (
            <p className="flex items-center gap-2 text-sm">
              <MapPin className="size-4 text-primary" />
              <span className="font-mono tabular-nums">{rider.current_lat!.toFixed(5)}, {rider.current_lng!.toFixed(5)}</span>
              <span className="text-muted-foreground">· updated {timeAgo(rider.location_updated_at)}</span>
              {rider.location_is_demo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                  <FlaskConical className="size-3" /> Demo location
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No location set yet — pick one below to see pickups.</p>
          )}
          <Button size="sm" variant="outline" onClick={useMyLocation} disabled={geoState === "asking"}>
            {geoState === "asking" ? <Loader2 className="animate-spin" /> : <Crosshair />} Use my current location
          </Button>
        </div>
        {geoState === "denied" && <p className="mt-2 text-sm text-destructive">Location access was blocked — allow it in your browser, or use a demo spot below.</p>}
        <div className="mt-4 border-t border-border pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><FlaskConical className="size-3.5" /> Demo location — pretend you're here</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_SPOTS.map((s) => (
              <Button
                key={s.name}
                type="button"
                size="sm"
                variant={rider.location_is_demo && rider.current_lat === s.lat ? "default" : "secondary"}
                disabled={savingSpot !== null}
                onClick={() => save(s.lat, s.lng, true, s.name)}
              >
                {savingSpot === s.name && <Loader2 className="animate-spin" />} {s.name}
              </Button>
            ))}
          </div>
        </div>
      </DashCard>

      {/* Filters */}
      <DashCard title="Filter pickups" description={`Showing ${rider.vehicle_type === "CARGO" ? "cargo" : "bike"}-compatible orders only.`}>
        <div className="space-y-4">
          <FilterRow label="Within">
            <div className="flex flex-wrap gap-2">
              {RADII.map((r) => (
                <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>{r} km</Chip>
              ))}
            </div>
          </FilterRow>
          <FilterRow label="Priority">
            <div className="flex flex-wrap gap-2">
              <Chip active={priority === null} onClick={() => setPriority(null)}>All</Chip>
              {(["URGENT", "HIGH", "NORMAL"] as Priority[]).map((p) => (
                <Chip key={p} active={priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</Chip>
              ))}
            </div>
          </FilterRow>
          <FilterRow label="Sort by">
            <div className="flex flex-wrap gap-2">
              <Chip active={sort === "nearest"} onClick={() => setSort("nearest")}>Nearest first</Chip>
              <Chip active={sort === "priority"} onClick={() => setSort("priority")}>Priority first</Chip>
            </div>
          </FilterRow>
        </div>
      </DashCard>

      {/* Nearby orders */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Pickups within {radius} km{priority ? ` · ${PRIORITY_LABEL[priority]}` : ""}</h2>
        {!hasLocation ? (
          <EmptyState icon={MapPin} title="Set your location first" description="Choose your current location or a demo spot above, and nearby pickups will appear here." />
        ) : orders.isLoading ? (
          <CardSkeleton rows={3} />
        ) : orders.isError ? (
          <ErrorState description={(orders.error as Error).message} />
        ) : (orders.data?.length ?? 0) === 0 ? (
          <EmptyState icon={PackageOpen} title="No pickups nearby right now" description="New orders land here automatically — check again in a bit, or widen the radius." />
        ) : (
          <ul className="grid gap-3">
            {orders.data!.map((o, i) => (
              <li
                key={o.id}
                className="animate-enter rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors hover:border-primary/40"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><VehicleIcon v={o.vehicle_type} className="size-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{o.pickup_address}</p>
                      <p className="truncate text-xs text-muted-foreground">{o.parcel_summary}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">{Number(o.pickup_distance_km).toFixed(1)} km</p>
                    <p className="text-xs text-muted-foreground">to pickup</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={o.priority} />
                  {o.handle_with_care && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"><ShieldCheck className="size-3" /> Handle with care</span>
                  )}
                  <span className="text-xs text-muted-foreground">posted {timeAgo(o.created_at)}</span>
                  <Button size="sm" variant="hero" className="ml-auto" onClick={() => accept(o.id)}>Accept</Button>
                </div>
              </li>
            ))}
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
