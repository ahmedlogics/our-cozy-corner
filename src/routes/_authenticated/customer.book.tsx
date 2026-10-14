import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, Crosshair, Loader2, MapPin, ArrowRight, ArrowLeft, AlertTriangle, ArrowUp, Minus } from "lucide-react";
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
import { createOrder, fetchQuote, serviceAreasQuery, type BookingInput, type Quote, type VehicleType } from "@/features/orders/orders";

function BookErrorComponent({ error }: { error: unknown }) {
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
  pendingComponent: () => <DashboardShell role="Customer" title="New delivery" items={customerNav("book")}><CardSkeleton rows={6} /></DashboardShell>,
  errorComponent: BookErrorComponent,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
  component: Book,
});

const STEPS = ["Pickup & drop-off", "Recipient & parcel", "Price & confirm"];
const validPt = (p: Pt | null): p is Pt => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

const KARACHI_AREAS = [
  { name: "Saddar", lat: 24.856, lng: 67.031 },
  { name: "Clifton", lat: 24.8138, lng: 67.0299 },
  { name: "DHA Phase 5", lat: 24.8015, lng: 67.0658 },
  { name: "Gulshan-e-Iqbal", lat: 24.92, lng: 67.099 },
  { name: "North Nazimabad", lat: 24.9425, lng: 67.04 },
  { name: "Tariq Road", lat: 24.8715, lng: 67.062 },
] as const;

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
      <div className="space-y-1"><Label htmlFor={`${id}-lat`} className="text-xs">Latitude</Label><Input id={`${id}-lat`} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} onBlur={() => commit(lat, lng)} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-lng`} className="text-xs">Longitude</Label><Input id={`${id}-lng`} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} onBlur={() => commit(lat, lng)} /></div>
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
  const [vehicle, setVehicle] = useState<VehicleType>("BIKE");
  const [care, setCare] = useState(false);
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [geo, setGeo] = useState<"idle" | "asking" | "suggested" | "denied">("idle");
  const [suggested, setSuggested] = useState<Pt | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const askLocation = () => {
    if (!("geolocation" in navigator)) return setGeo("denied");
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => { setSuggested({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); setGeo("suggested"); },
      () => setGeo("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const outside = (p: Pt | null) => !!(p && areaInfo && haversineKm(p, areaInfo.center) > areaInfo.radiusKm);

  const input = (): BookingInput => ({
    pickup_address: pickupAddr, pickup: pickup!, dropoff_address: dropAddr, dropoff: dropoff!,
    recipient_name: rName, recipient_phone: rPhone, parcel_description: parcel, vehicle, care,
    priority,
  });

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!validPt(pickup)) e["pickup"] = "Drop a pickup pin on the map or enter valid coordinates.";
      else if (outside(pickup)) e["pickup"] = `Pickup is outside our ${area?.name ?? ""} service area.`;
      if (!validPt(dropoff)) e["dropoff"] = "Drop a destination pin on the map or enter valid coordinates.";
      else if (outside(dropoff)) e["dropoff"] = `Drop-off is outside our ${area?.name ?? ""} service area.`;
      if (pickup && dropoff && pickup.lat === dropoff.lat && pickup.lng === dropoff.lng) e["dropoff"] = "Drop-off must differ from pickup.";
      if (pickupAddr.trim().length < 3) e["pickupAddr"] = "Write the full pickup address.";
      if (dropAddr.trim().length < 3) e["dropAddr"] = "Write the full drop-off address.";
    }
    if (s === 1) {
      if (rName.trim().length < 2) e["rName"] = "Enter the recipient's name.";
      if (!/^\+?[0-9 -]{10,16}$/.test(rPhone.trim())) e["rPhone"] = "Enter a valid phone, e.g. 0300 1234567.";
      if (parcel.trim().length < 2) e["parcel"] = "Describe what you're sending.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    if (!validate(step)) return;
    if (step === 1) {
      setQuote(null); setQuoteErr(null); setStep(2);
      try { setQuote(await fetchQuote(input())); } catch (err) { setQuoteErr((err as Error).message); }
      return;
    }
    setStep(step + 1);
  };

  // Refresh quote if options change on the final step
  useEffect(() => {
    if (step !== 2 || !pickup || !dropoff) return;
    fetchQuote(input()).then((q) => { setQuote(q); setQuoteErr(null); }).catch((e) => setQuoteErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle, care]);

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

  return (
    <DashboardShell role="Customer" title="New delivery" items={customerNav("book")}>
      <ol className="flex items-center gap-2" aria-label="Booking progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-all duration-300", i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "scale-110 border-primary text-primary" : "border-border text-muted-foreground")}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm sm:inline", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-0.5 flex-1 overflow-hidden rounded bg-border"><span className="block h-full bg-primary transition-[width] duration-500" style={{ width: i < step ? "100%" : "0%" }} /></span>}
          </li>
        ))}
      </ol>

      <div key={step} className="animate-enter rounded-2xl border border-border bg-card p-5 shadow-soft md:p-6">
        {step === 0 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-border p-1">
                  {(["pickup", "dropoff"] as const).map((w) => (
                    <button key={w} type="button" onClick={() => setWhich(w)} className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", which === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                      Set {w === "pickup" ? "pickup" : "destination"}
                    </button>
                  ))}
                </div>
                <Button type="button" size="sm" variant="glass" onClick={askLocation} disabled={geo === "asking"}>
                  {geo === "asking" ? <Loader2 className="animate-spin" /> : <Crosshair />} Use my location
                </Button>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border bg-secondary/30 p-2.5">
                <p className="text-xs font-medium text-muted-foreground">Select {which === "pickup" ? "pickup" : "drop-off"} area:</p>
                <div className="flex flex-wrap gap-1.5">
                  {KARACHI_AREAS.map((a) => (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => {
                        const pt = { lat: a.lat, lng: a.lng };
                        if (which === "pickup") {
                          setPickup(pt);
                          if (!pickupAddr) setPickupAddr(`${a.name}, Karachi`);
                          setWhich("dropoff");
                        } else {
                          setDropoff(pt);
                          if (!dropAddr) setDropAddr(`${a.name}, Karachi`);
                        }
                      }}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary hover:bg-primary/10"
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              {geo === "suggested" && suggested && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
                  <span>Suggested pickup: <span className="font-mono">{suggested.lat}, {suggested.lng}</span>{outside(suggested) && <span className="text-destructive"> — outside service area</span>}</span>
                  <Button size="sm" variant="hero" className="ml-auto" onClick={() => { setPickup(suggested); setGeo("idle"); setWhich("dropoff"); }}>Use this point</Button>
                  <Button size="sm" variant="ghost" onClick={() => setGeo("idle")}>Pick another</Button>
                </div>
              )}
              {geo === "denied" && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Location access unavailable — select an area above or tap the map.</p>}
              <MapPicker
                key={which}
                label={`Map: tap to set ${which}`}
                center={(which === "pickup" ? pickup : dropoff) ?? (which === "dropoff" ? pickup : null) ?? center}
                area={areaInfo}
                value={which === "pickup" ? pickup : dropoff}
                other={which === "pickup" ? dropoff : pickup}
                tone={which === "pickup" ? "primary" : "accent"}
                onChange={(p) => (which === "pickup" ? setPickup(p) : setDropoff(p))}
              />
              <p className="text-xs text-muted-foreground">Click an area above or tap the map to place pins. The circle indicates the {area?.name} service area.</p>
            </div>
            <div className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 text-primary" /> Pickup</legend>
                <Textarea placeholder="House / street / area, landmarks" value={pickupAddr} onChange={(e) => setPickupAddr(e.target.value)} rows={2} />
                <Err k="pickupAddr" />
                <details className="pt-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Manual GPS Coordinates (Optional)
                  </summary>
                  <div className="mt-2 pt-2 border-t border-border">
                    <CoordInputs id="pu" value={pickup} onChange={setPickup} />
                  </div>
                </details>
                <Err k="pickup" />
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 text-accent" /> Drop-off</legend>
                <Textarea placeholder="House / street / area, landmarks" value={dropAddr} onChange={(e) => setDropAddr(e.target.value)} rows={2} />
                <Err k="dropAddr" />
                <details className="pt-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Manual GPS Coordinates (Optional)
                  </summary>
                  <div className="mt-2 pt-2 border-t border-border">
                    <CoordInputs id="do" value={dropoff} onChange={setDropoff} />
                  </div>
                </details>
                <Err k="dropoff" />
              </fieldset>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="rn">Recipient name</Label><Input id="rn" value={rName} onChange={(e) => setRName(e.target.value)} /><Err k="rName" /></div>
            <div className="space-y-1.5"><Label htmlFor="rp">Recipient phone</Label><Input id="rp" type="tel" placeholder="0300 1234567" value={rPhone} onChange={(e) => setRPhone(e.target.value)} /><Err k="rPhone" /></div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="pd">Parcel description</Label><Textarea id="pd" value={parcel} onChange={(e) => setParcel(e.target.value)} rows={3} /><Err k="parcel" /></div>
            <div className="space-y-2 md:col-span-2">
              <Label>Vehicle</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["BIKE", "CARGO"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setVehicle(v)} aria-pressed={vehicle === v}
                    className={cn("flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5", vehicle === v ? "border-primary bg-primary/10" : "border-border")}>
                    <VehicleIcon v={v} className="size-6 text-primary" />
                    <div><p className="font-semibold">{v === "BIKE" ? "Bike" : "Cargo"}</p><p className="text-xs text-muted-foreground">{v === "BIKE" ? "Small parcels, documents" : "Large or heavy items"}</p></div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Delivery Priority (Day 2 Peak Hours)</Label>
                <span className="text-xs text-muted-foreground">Sets dispatch priority for riders</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
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
                        "flex flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-all hover:-translate-y-0.5",
                        isSelected
                          ? p.value === "URGENT"
                            ? "border-destructive bg-destructive/10 ring-1 ring-destructive/40 font-semibold"
                            : p.value === "HIGH"
                            ? "border-warning bg-warning/10 ring-1 ring-warning/40 font-semibold"
                            : "border-primary bg-primary/10 ring-1 ring-primary/40 font-semibold"
                          : "border-border hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-sm">
                        <Icon className={cn("size-4", p.color)} />
                        <span>{p.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-3 md:col-span-2"><Checkbox checked={care} onCheckedChange={(c) => setCare(c === true)} /><span className="text-sm">Handle With Care (fragile items, extra fee)</span></label>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <h3 className="font-semibold">Review</h3>
              <p><span className="text-muted-foreground">Pickup:</span> {pickupAddr} <span className="font-mono text-xs text-muted-foreground">({pickup?.lat}, {pickup?.lng})</span></p>
              <p><span className="text-muted-foreground">Drop-off:</span> {dropAddr} <span className="font-mono text-xs text-muted-foreground">({dropoff?.lat}, {dropoff?.lng})</span></p>
              <p><span className="text-muted-foreground">Recipient:</span> {rName} · {rPhone}</p>
              <p><span className="text-muted-foreground">Parcel:</span> {parcel}</p>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-muted-foreground">Priority:</span>
                <PriorityBadge priority={priority} />
              </div>
              <div className="flex gap-2 pt-2">
                {(["BIKE", "CARGO"] as const).map((v) => <Button key={v} size="sm" variant={vehicle === v ? "hero" : "glass"} onClick={() => setVehicle(v)}>{v}</Button>)}
              </div>
              <label className="flex items-center gap-3"><Checkbox checked={care} onCheckedChange={(c) => setCare(c === true)} />Handle With Care</label>
            </div>
            <div>
              {quoteErr ? <ErrorState title="Can't price this delivery" description={quoteErr} /> : !quote ? <CardSkeleton rows={5} /> : (
                <FareReceipt distanceKm={quote.distance_km} vehicle={quote.vehicle_type} base={quote.base_fare} distance={quote.distance_fare} perKm={quote.per_km_rate} care={quote.care_fee} total={quote.total_fare} />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}><ArrowLeft /> Back</Button>
        {step < 2 ? (
          <Button variant="hero" onClick={next}>Continue <ArrowRight /></Button>
        ) : (
          <Button variant="hero" onClick={confirm} disabled={busy || !quote || !!quoteErr}>{busy && <Loader2 className="animate-spin" />} Confirm booking</Button>
        )}
      </div>
    </DashboardShell>
  );
}
