import { useEffect, useState, useRef } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Check,
  Crosshair,
  Loader2,
  MapPin,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  ArrowUp,
  Minus,
  Search,
  Compass,
  Sparkles,
  ChevronDown,
  Navigation,
} from "lucide-react";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { type Priority } from "@/features/priority/priority";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CardSkeleton, ErrorState } from "@/components/shared/States";
import { MapPicker, type Pt } from "@/components/shared/MapPicker";
import { FareReceipt, VehicleIcon } from "@/components/shared/OrderBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { customerNav } from "@/features/customer/nav";
import { haversineKm } from "@/features/locations/haversine";
import {
  KARACHI_AREAS,
  searchKarachiLocations,
  findNearestKarachiArea,
  type KarachiArea,
  type SearchResult,
} from "@/features/locations/karachi-areas";
import {
  createOrder,
  fetchQuote,
  serviceAreasQuery,
  type BookingInput,
  type Quote,
  type VehicleType,
} from "@/features/orders/orders";

function BookErrorComponent({ error }: { error: unknown }) {
  const router = useRouter();
  const msg = (error as Error)?.message ?? String(error);
  return (
    <DashboardShell role="Customer" title="New delivery" items={customerNav("book")}>
      <div className="space-y-4">
        <ErrorState description={msg} />
        <Button onClick={() => router.invalidate()}>Retry</Button>
      </div>
    </DashboardShell>
  );
}

export const Route = createFileRoute("/_authenticated/customer/book")({
  head: () => ({
    meta: [
      { title: "Book a delivery — LogiPulse" },
      { name: "description", content: "Pick points on the map, add parcel details and see your fare before booking." },
      { property: "og:title", content: "Book a delivery — LogiPulse" },
      { property: "og:description", content: "Pick points on the map, add parcel details and see your fare before booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceAreasQuery),
  pendingComponent: () => (
    <DashboardShell role="Customer" title="New delivery" items={customerNav("book")}>
      <CardSkeleton rows={6} />
    </DashboardShell>
  ),
  errorComponent: BookErrorComponent,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
  component: Book,
});

const STEPS = ["Pickup & drop-off", "Recipient & parcel", "Price & confirm"];
const validPt = (p: Pt | null): p is Pt =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

function CoordInputs({ value, onChange, id }: { value: Pt | null; onChange: (p: Pt | null) => void; id: string }) {
  const [lat, setLat] = useState(value ? String(value.lat) : "");
  const [lng, setLng] = useState(value ? String(value.lng) : "");

  useEffect(() => {
    setLat(value ? String(value.lat) : "");
    setLng(value ? String(value.lng) : "");
  }, [value]);

  const commit = (a: string, b: string) => {
    const p = { lat: Number(a), lng: Number(b) };
    if (a && b && validPt(p)) onChange(p);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label htmlFor={`${id}-lat`} className="text-xs">Latitude</Label>
        <Input id={`${id}-lat`} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} onBlur={() => commit(lat, lng)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-lng`} className="text-xs">Longitude</Label>
        <Input id={`${id}-lng`} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} onBlur={() => commit(lat, lng)} />
      </div>
    </div>
  );
}

/** Smart interactive address search box that synchronizes directly with the map pin */
function AddressSearchBox({
  id,
  label,
  value,
  onChange,
  point,
  onSelectPoint,
  tone,
  placeholder,
  error,
  isOutside,
  isActive,
  onFocusInput,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  point: Pt | null;
  onSelectPoint: (pt: Pt, name?: string) => void;
  tone: "primary" | "accent";
  placeholder: string;
  error?: string | undefined;
  isOutside?: boolean | undefined;
  isActive: boolean;
  onFocusInput: () => void;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-search suggestions as the user types
  useEffect(() => {
    if (value.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const matches = await searchKarachiLocations(value, 5);
        setResults(matches);
        setShowDropdown(matches.length > 0);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [value]);

  // Click outside listener to dismiss dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const locateNow = async () => {
    if (!value.trim()) return;
    setSearching(true);
    try {
      const matches = await searchKarachiLocations(value, 1);
      if (matches[0]) {
        // Pin coordinates without overwriting user's typed address
        onSelectPoint({ lat: matches[0].lat, lng: matches[0].lng });
        setShowDropdown(false);
        toast.success(`Pinned location on map`);
      } else {
        toast.info("Could not find exact coordinates. You can tap on the map to place the pin.");
      }
    } finally {
      setSearching(false);
    }
  };

  const nearest = point ? findNearestKarachiArea(point) : null;

  return (
    <div ref={containerRef} className={cn("space-y-2 rounded-2xl border p-4 transition-all", isActive ? "border-primary/60 bg-primary/5 shadow-soft" : "border-border bg-card")}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold cursor-pointer" onClick={onFocusInput}>
          <MapPin className={cn("size-4", tone === "primary" ? "text-primary" : "text-accent")} />
          <span>{label}</span>
        </label>
        {point ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              isOutside ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-400"
            )}
          >
            {isOutside ? "Outside Area" : "✓ Pinned on map"}
          </span>
        ) : (
          <span className="text-xs text-amber-400/90 font-medium">Pin required on map</span>
        )}
      </div>

      <div className="relative">
        <Textarea
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            onFocusInput();
            if (results.length > 0) setShowDropdown(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              locateNow();
            }
          }}
          rows={2}
          className="pr-22 text-sm"
        />

        <div className="absolute right-2 top-2">
          <Button
            type="button"
            size="sm"
            variant="glass"
            className="h-7 gap-1 px-2.5 text-xs shadow-xs"
            disabled={searching || !value.trim()}
            onClick={locateNow}
            title="Search this address and pin on map"
          >
            {searching ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3 text-primary" />}
            Find on map
          </Button>
        </div>

        {/* Live Search Autocomplete Dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg backdrop-blur-md">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Karachi Locations matching &quot;{value.slice(0, 20)}&quot;:
            </div>
            {results.map((r, idx) => (
              <button
                key={`${r.name}-${idx}`}
                type="button"
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent/40"
                onClick={() => {
                  onSelectPoint({ lat: r.lat, lng: r.lng }, r.name);
                  setShowDropdown(false);
                }}
              >
                <MapPin className={cn("mt-0.5 size-3.5 shrink-0", tone === "primary" ? "text-primary" : "text-accent")} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{r.name}</p>
                  {r.detail && <p className="text-[11px] text-muted-foreground truncate">{r.detail}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-primary font-medium">Pin on map &gt;</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {point && (
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            {nearest ? `Area: ${nearest.name}` : "Location pinned on map"}
          </span>
          <button
            type="button"
            onClick={onFocusInput}
            className="text-[11px] text-primary hover:underline font-medium"
          >
            Focus on map
          </button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Book() {
  const { data: areas } = useSuspenseQuery(serviceAreasQuery);
  const area = areas[0];
  const center = area ? { lat: area.center_lat, lng: area.center_lng } : { lat: 24.8607, lng: 67.0011 };
  const areaInfo = area ? { center, radiusKm: Number(area.radius_km) } : undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState<Pt | null>(null);
  const [dropoff, setDropoff] = useState<Pt | null>(null);
  const [which, setWhich] = useState<"pickup" | "dropoff">("pickup");
  const [pickupAddr, setPickupAddr] = useState("");
  const [dropAddr, setDropAddr] = useState("");
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [parcel, setParcel] = useState("");
  const [weight, setWeight] = useState("5");
  const [vehicle, setVehicle] = useState<VehicleType>("BIKE");
  const [care, setCare] = useState(false);
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [loader, setLoader] = useState(false);
  const [geo, setGeo] = useState<"idle" | "asking" | "suggested" | "denied">("idle");
  const [suggested, setSuggested] = useState<Pt | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Area catalog filter & visibility
  const [areaCategory, setAreaCategory] = useState<string>("All");
  const [areaFilter, setAreaFilter] = useState("");
  const [showAreaCatalog, setShowAreaCatalog] = useState(false);

  const handleSelectVehicle = (v: VehicleType) => {
    setVehicle(v);
    if (v === "BIKE") {
      setLoader(false);
    }
  };

  const askLocation = () => {
    if (!("geolocation" in navigator)) return setGeo("denied");
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pt = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) };
        setSuggested(pt);
        setGeo("suggested");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const outside = (p: Pt | null) => !!(p && areaInfo && haversineKm(p, areaInfo.center) > areaInfo.radiusKm);

  const input = (): BookingInput => ({
    pickup_address: pickupAddr,
    pickup: pickup!,
    dropoff_address: dropAddr,
    dropoff: dropoff!,
    recipient_name: rName,
    recipient_phone: rPhone,
    parcel_description: parcel.trim() || "Standard Delivery Package",
    parcel_weight_kg: Number(weight) || 1,
    vehicle,
    care,
    priority,
    loader: vehicle === "CARGO" ? loader : false,
  });

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!validPt(pickup)) e["pickup"] = "Search your pickup area or tap on the map to drop the pickup pin.";
      else if (outside(pickup)) e["pickup"] = `Pickup is outside our ${area?.name ?? "Karachi"} service area.`;
      if (!validPt(dropoff)) e["dropoff"] = "Search your destination area or tap on the map to drop the drop-off pin.";
      else if (outside(dropoff)) e["dropoff"] = `Drop-off is outside our ${area?.name ?? "Karachi"} service area.`;
      if (pickup && dropoff && pickup.lat === dropoff.lat && pickup.lng === dropoff.lng)
        e["dropoff"] = "Drop-off must be a different location from pickup.";
      if (pickupAddr.trim().length < 3) e["pickupAddr"] = "Please write the full pickup address.";
      if (dropAddr.trim().length < 3) e["dropAddr"] = "Please write the full drop-off address.";
    }
    if (s === 1) {
      if (rName.trim().length < 2) e["rName"] = "Enter the recipient's name.";
      if (!/^\+?[0-9 -]{10,16}$/.test(rPhone.trim())) e["rPhone"] = "Enter a valid phone, e.g. 0300 1234567.";
      const numWeight = Number(weight);
      if (!weight.trim() || isNaN(numWeight) || numWeight <= 0) {
        e["weight"] = "Mandatory: Enter parcel weight in kg (must be greater than 0).";
      } else if (numWeight > 500) {
        e["weight"] = "Maximum allowed parcel weight is 500 kg.";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    if (!validate(step)) return;
    if (step === 1) {
      setQuote(null);
      setQuoteErr(null);
      setStep(2);
      try {
        setQuote(await fetchQuote(input()));
      } catch (err) {
        setQuoteErr((err as Error).message);
      }
      return;
    }
    setStep(step + 1);
  };

  // Refresh quote if options change on the final step
  useEffect(() => {
    if (step !== 2 || !pickup || !dropoff) return;
    fetchQuote(input())
      .then((q) => {
        setQuote(q);
        setQuoteErr(null);
      })
      .catch((e) => setQuoteErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle, care, loader, weight]);

  const confirm = async () => {
    setBusy(true);
    try {
      const id = await createOrder(input());
      await qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Delivery booked!");
      navigate({ to: "/customer/orders/$orderId", params: { orderId: id }, search: { created: true } });
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null);

  // Map click handler with automatic reverse geocoding (never overwrites non-empty addresses)
  const handleMapClick = (p: Pt) => {
    const nearest = findNearestKarachiArea(p);
    const areaName = nearest ? `${nearest.name}, Karachi` : "Karachi";

    if (which === "pickup") {
      setPickup(p);
      if (!pickupAddr.trim()) {
        setPickupAddr(areaName);
      }
      toast.success(`Pickup pin placed near ${nearest?.name || "Karachi"}`);
    } else {
      setDropoff(p);
      if (!dropAddr.trim()) {
        setDropAddr(areaName);
      }
      toast.success(`Destination pin placed near ${nearest?.name || "Karachi"}`);
    }
  };

  // Filtered areas for quick-select
  const filteredAreas = KARACHI_AREAS.filter((a) => {
    const matchesCategory = areaCategory === "All" || a.category === areaCategory;
    const q = areaFilter.trim().toLowerCase();
    const matchesQuery =
      !q ||
      a.name.toLowerCase().includes(q) ||
      (a.aliases || []).some((al) => al.includes(q)) ||
      a.category.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });

  return (
    <DashboardShell role="Customer" title="New delivery" items={customerNav("book")}>
      <ol className="flex items-center gap-3 border-b border-border pb-4" aria-label="Booking progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2.5">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg border text-xs font-bold transition-all duration-300",
                i < step
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : i === step
                    ? "border-primary bg-primary/15 text-primary font-extrabold ring-2 ring-primary/25"
                    : "border-border bg-secondary/50 text-muted-foreground"
              )}
            >
              {i < step ? <Check className="size-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs sm:inline transition-all pb-0.5",
                i === step
                  ? "font-bold text-foreground border-b-2 border-primary"
                  : "text-muted-foreground opacity-80 font-medium"
              )}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-0.5 flex-1 overflow-hidden rounded bg-border/60">
                <span className="block h-full bg-primary transition-[width] duration-500" style={{ width: i < step ? "100%" : "0%" }} />
              </span>
            )}
          </li>
        ))}
      </ol>

      <div key={step} className="animate-enter rounded-2xl border border-border bg-card p-5 shadow-soft md:p-6 text-card-foreground">
        {step === 0 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Left: Map & Area Selector */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-border bg-secondary/40 p-1">
                  <button
                    type="button"
                    onClick={() => setWhich("pickup")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      which === "pickup" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MapPin className="size-3.5" />
                    <span>1. Set Pickup</span>
                    {pickup && <span className="size-2 rounded-full bg-emerald-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWhich("dropoff")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      which === "dropoff" ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Navigation className="size-3.5" />
                    <span>2. Set Destination</span>
                    {dropoff && <span className="size-2 rounded-full bg-emerald-400" />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="glass"
                    onClick={() => setShowAreaCatalog((v) => !v)}
                    className="text-xs gap-1.5"
                  >
                    <Compass className="size-3.5 text-primary" />
                    <span>{showAreaCatalog ? "Hide Area List" : "Browse Karachi Hubs"}</span>
                    <ChevronDown className={cn("size-3.5 transition-transform", showAreaCatalog && "rotate-180")} />
                  </Button>

                  <Button type="button" size="sm" variant="glass" onClick={askLocation} disabled={geo === "asking"} className="text-xs">
                    {geo === "asking" ? <Loader2 className="animate-spin size-3.5" /> : <Crosshair className="size-3.5" />}
                    GPS
                  </Button>
                </div>
              </div>

              {/* 30+ Karachi Areas Quick Picker - Collapsible Drawer */}
              {showAreaCatalog && (
                <div className="animate-enter relative space-y-2.5 rounded-xl border border-border bg-card p-3.5 shadow-md">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-1.5">
                      <Compass className="size-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        Select {which === "pickup" ? "Pickup" : "Drop-off"} Area ({filteredAreas.length} hubs)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={areaFilter}
                          onChange={(e) => setAreaFilter(e.target.value)}
                          placeholder="Search areas..."
                          className="h-7 pl-8 pr-2 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAreaCatalog(false)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground font-medium"
                      >
                        ✕ Close
                      </button>
                    </div>
                  </div>

                  {/* Category Pills */}
                  <div className="flex flex-wrap gap-1">
                    {(["All", "Popular", "North", "Central", "South", "East", "Malir & Korangi"] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setAreaCategory(cat)}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                          areaCategory === cat
                            ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Area Chips */}
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {filteredAreas.map((a) => {
                      const isSelected =
                        (which === "pickup" && pickup && Math.abs(pickup.lat - a.lat) < 0.005 && Math.abs(pickup.lng - a.lng) < 0.005) ||
                        (which === "dropoff" && dropoff && Math.abs(dropoff.lat - a.lat) < 0.005 && Math.abs(dropoff.lng - a.lng) < 0.005);

                      return (
                        <button
                          key={a.name}
                          type="button"
                          onClick={() => {
                            const pt = { lat: a.lat, lng: a.lng };
                            if (which === "pickup") {
                              setPickup(pt);
                              setPickupAddr(`${a.name}, Karachi`);
                              setWhich("dropoff");
                              toast.success(`Pickup set to ${a.name}`);
                            } else {
                              setDropoff(pt);
                              setDropAddr(`${a.name}, Karachi`);
                              toast.success(`Drop-off set to ${a.name}`);
                            }
                            setShowAreaCatalog(false);
                          }}
                          className={cn(
                            "rounded-lg border px-2.5 py-1 text-xs transition-all",
                            isSelected
                              ? "border-primary bg-primary/20 text-primary font-bold shadow-xs"
                              : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                          )}
                        >
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {geo === "suggested" && suggested && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
                  <span className="text-foreground font-medium">
                    📍 Current location detected
                    {outside(suggested) && <span className="text-destructive font-semibold"> — outside Karachi service area</span>}
                  </span>
                  <Button
                    size="sm"
                    variant="hero"
                    className="ml-auto text-xs"
                    onClick={() => {
                      setPickup(suggested);
                      const nearest = findNearestKarachiArea(suggested);
                      if (nearest) setPickupAddr(`Near ${nearest.name}, Karachi`);
                      setGeo("idle");
                      setWhich("dropoff");
                    }}
                  >
                    Use as Pickup
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setGeo("idle")}>Dismiss</Button>
                </div>
              )}

              {geo === "denied" && (
                <p className="rounded-xl bg-warning/10 p-2.5 text-xs text-warning">
                  Browser location access not available — search your area below or tap on the map.
                </p>
              )}

              {/* Enhanced Dual-Pin Map */}
              <MapPicker
                label={`Map: tap to place ${which}`}
                center={(which === "pickup" ? pickup : dropoff) ?? (which === "dropoff" ? pickup : null) ?? center}
                area={areaInfo}
                pickup={pickup}
                dropoff={dropoff}
                activeMode={which}
                pickupLabel={pickupAddr || "Pickup Location"}
                dropoffLabel={dropAddr || "Drop-off Destination"}
                onChange={handleMapClick}
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <p>💡 Tip: Type your area name, choose an area chip, or tap the map directly to drop pins.</p>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> Pickup</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-accent" /> Destination</span>
                </div>
              </div>
            </div>

            {/* Right: Smart Address Inputs */}
            <div className="space-y-4">
              <AddressSearchBox
                id="pickup-address"
                label="Pickup Address"
                value={pickupAddr}
                onChange={setPickupAddr}
                point={pickup}
                onSelectPoint={(pt, name) => {
                  setPickup(pt);
                  if (name && !pickupAddr.trim()) setPickupAddr(`${name}, Karachi`);
                  setWhich("dropoff");
                }}
                tone="primary"
                placeholder="Type area (e.g. North Karachi Sector 11, Saddar, Clifton)..."
                error={errors["pickupAddr"] || errors["pickup"]}
                isOutside={outside(pickup)}
                isActive={which === "pickup"}
                onFocusInput={() => setWhich("pickup")}
              />

              <div className="h-px bg-border my-2" />

              <AddressSearchBox
                id="dropoff-address"
                label="Drop-off Destination"
                value={dropAddr}
                onChange={setDropAddr}
                point={dropoff}
                onSelectPoint={(pt, name) => {
                  setDropoff(pt);
                  if (name && !dropAddr.trim()) setDropAddr(`${name}, Karachi`);
                }}
                tone="accent"
                placeholder="Type area (e.g. Gulshan-e-Iqbal, DHA Phase 5, Jauhar)..."
                error={errors["dropAddr"] || errors["dropoff"]}
                isOutside={outside(dropoff)}
                isActive={which === "dropoff"}
                onFocusInput={() => setWhich("dropoff")}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rn" className="font-semibold text-foreground">
                Recipient Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rn"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="e.g. Muhammad Ali"
              />
              <Err k="rName" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rp" className="font-semibold text-foreground">
                Recipient Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rp"
                type="tel"
                placeholder="0300 1234567"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
              />
              <Err k="rPhone" />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="pd" className="font-semibold text-foreground">
                Parcel Description <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
              </Label>
              <Textarea
                id="pd"
                value={parcel}
                onChange={(e) => setParcel(e.target.value)}
                rows={2}
                placeholder="Optional notes about parcel contents, handling, etc."
              />
            </div>

            {/* Mandatory Weight Entry */}
            <div className="space-y-2 md:col-span-2 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label htmlFor="pw" className="font-semibold text-foreground flex items-center gap-1.5">
                  Parcel Weight (kg) <span className="text-destructive font-bold">*</span>
                  <span className="text-[11px] font-normal text-muted-foreground">(Mandatory entry)</span>
                </Label>
                <span className="text-xs font-mono font-bold text-primary">
                  {weight ? `${weight} kg` : "Required"}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center pt-1">
                <div className="relative w-full sm:w-44">
                  <Input
                    id="pw"
                    type="number"
                    min="0.1"
                    max="500"
                    step="0.5"
                    placeholder="e.g. 5"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="pr-10 text-sm font-semibold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                    kg
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1">Quick Select:</span>
                  {["1", "5", "10", "20", "50"].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWeight(w)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                        weight === w
                          ? "border-primary bg-primary text-primary-foreground shadow-xs"
                          : "border-border bg-card text-foreground hover:border-primary/60"
                      )}
                    >
                      {w} kg
                    </button>
                  ))}
                </div>
              </div>
              <Err k="weight" />
            </div>

            {/* Vehicle Selection */}
            <div className="space-y-2 md:col-span-2">
              <Label className="font-semibold text-foreground">Vehicle Category</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["BIKE", "CARGO"] as const).map((v) => {
                  const isBike = v === "BIKE";
                  const isSelected = vehicle === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleSelectVehicle(v)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                          : "border-border bg-card hover:border-primary/50"
                      )}
                    >
                      <div className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-lg transition-colors",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                      )}>
                        <VehicleIcon v={v} className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-foreground">{isBike ? "Motorbike" : "Cargo Delivery"}</p>
                          <span className="font-mono text-xs font-bold text-primary">
                            {isBike ? "Rs. 100 base" : "Rs. 300 base"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isBike ? "Small parcels, food, documents (Rs. 25/km)" : "Large boxes, appliances, heavy goods (Rs. 50/km)"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Loader / Labour Option for CARGO */}
            {vehicle === "CARGO" ? (
              <div className="animate-enter rounded-xl border border-border bg-secondary/40 p-4 md:col-span-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    id="cargo-loader"
                    checked={loader}
                    onCheckedChange={(c) => setLoader(c === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        Add Loader / Labour (+ Rs. 100)
                      </span>
                      <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        Optional
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Need helper labour for lifting, loading, and unloading heavy cargo at pickup and delivery.
                    </p>
                  </div>
                </label>
              </div>
            ) : null}

            {/* Delivery Priority (Peak Hours) */}
            <div className="space-y-2 md:col-span-2 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-foreground">Delivery Priority (Peak Hours)</Label>
                <span className="text-xs text-muted-foreground">Sets dispatch priority for riders</span>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-1">
                {([
                  { value: "NORMAL", label: "Normal", desc: "Standard dispatch", icon: Minus, color: "text-muted-foreground" },
                  { value: "HIGH", label: "High", desc: "Priority matching", icon: ArrowUp, color: "text-amber-500" },
                  { value: "URGENT", label: "Urgent", desc: "Immediate peak priority", icon: AlertTriangle, color: "text-rose-500" },
                ] as const).map((p) => {
                  const Icon = p.icon;
                  const isSelected = priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all",
                        isSelected
                          ? p.value === "URGENT"
                            ? "border-destructive bg-destructive/15 ring-1 ring-destructive text-foreground font-bold shadow-xs"
                            : p.value === "HIGH"
                            ? "border-warning bg-warning/15 ring-1 ring-warning text-foreground font-bold shadow-xs"
                            : "border-primary bg-primary/15 ring-1 ring-primary text-foreground font-bold shadow-xs"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-sm text-foreground">
                        <Icon className={cn("size-4", p.color)} />
                        <span>{p.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Handle With Care Option */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 md:col-span-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  id="care-opt"
                  checked={care}
                  onCheckedChange={(c) => setCare(c === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      Handle With Care (+ {vehicle === "CARGO" ? "Rs. 100" : "Rs. 50"})
                    </span>
                    <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      Optional
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Special priority handling for fragile, delicate, glassware, or high-value packages.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-foreground">Review Order Details</h3>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  Edit details
                </button>
              </div>

              <div className="space-y-2.5 rounded-xl border border-border bg-secondary/30 p-4 text-xs">
                <p>
                  <span className="font-semibold text-foreground">Pickup:</span>{" "}
                  <span className="text-foreground font-medium">{pickupAddr}</span>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Drop-off:</span>{" "}
                  <span className="text-foreground font-medium">{dropAddr}</span>
                </p>
                <div className="border-t border-border/70 pt-2" />
                <p>
                  <span className="font-semibold text-foreground">Recipient:</span>{" "}
                  <span className="text-foreground">{rName}</span> · <span className="font-mono text-foreground">{rPhone}</span>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Parcel:</span>{" "}
                  <span className="text-foreground">{parcel}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">Weight:</span>{" "}
                  <span className="font-mono font-bold text-primary">{weight} kg</span>
                </p>
                <div className="border-t border-border/70 pt-2" />
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Priority:</span>
                  <PriorityBadge priority={priority} />
                </div>
                <p>
                  <span className="font-semibold text-foreground">Vehicle:</span>{" "}
                  <span className="text-foreground font-bold">
                    {vehicle === "BIKE" ? "🏍️ Bike (Motorbike)" : "🚚 Cargo Delivery"}
                  </span>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Selected Extras:</span>{" "}
                  <span className="text-foreground">
                    {[
                      care ? `Handle With Care (+ Rs. ${vehicle === "CARGO" ? 100 : 50})` : null,
                      vehicle === "CARGO" && loader ? "Loader / Labour assistance (+ Rs. 100)" : null,
                    ].filter(Boolean).join(" · ") || "Standard delivery handling"}
                  </span>
                </p>
              </div>
            </div>

            <div>
              {quoteErr ? (
                <ErrorState title="Can't price this delivery" description={quoteErr} />
              ) : !quote ? (
                <CardSkeleton rows={5} />
              ) : (
                <FareReceipt
                  distanceKm={quote.distance_km}
                  vehicle={quote.vehicle_type}
                  base={quote.base_fare}
                  distance={quote.distance_fare}
                  perKm={quote.per_km_rate}
                  care={quote.care_fee}
                  loader={quote.loader_fee}
                  total={quote.total_fare}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
          <ArrowLeft /> Back
        </Button>
        {step < 2 ? (
          <Button variant="hero" onClick={next}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button variant="hero" onClick={confirm} disabled={busy || !quote || !!quoteErr}>
            {busy && <Loader2 className="animate-spin" />} Confirm booking
          </Button>
        )}
      </div>
    </DashboardShell>
  );
}
