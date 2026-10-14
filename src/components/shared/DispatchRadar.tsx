import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Bike, Compass, MapPin, Radio, ShieldCheck, Sparkles, Truck, Users } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

interface DispatchRadarProps {
  order: Database["public"]["Tables"]["orders"]["Row"];
  onCancel?: () => void;
}

const STATUS_MESSAGES = [
  "Broadcasting delivery request to nearby verified couriers...",
  "Alerting active riders within 5.0 km perimeter in Karachi...",
  "Matching vehicle type and optimal route...",
  "Waiting for nearest courier to accept the job...",
  "High dispatch priority active — alerting couriers...",
];

export function DispatchRadar({ order }: DispatchRadarProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import("leaflet").Map | null>(null);

  const [secondsElapsed, setSecondsElapsed] = useState<number>(() => {
    if (!order.created_at) return 0;
    const diff = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
    return diff > 0 ? diff : 0;
  });
  const [msgIndex, setMsgIndex] = useState<number>(0);

  // Mount ambient background Leaflet map centered at pickup location
  useEffect(() => {
    let cancelled = false;
    if (!mapEl.current || mapInstance.current) return;

    import("leaflet").then((L) => {
      if (cancelled || !mapEl.current || mapInstance.current) return;
      const m = L.map(mapEl.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
      }).setView([order.pickup_lat, order.pickup_lng], 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        opacity: 0.7,
      }).addTo(m);

      mapInstance.current = m;
    });

    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [order.pickup_lat, order.pickup_lng]);

  // Timer tick
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Cycle status broadcast message every 3.5s
  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 3500);
    return () => clearInterval(msgTimer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Nearby simulated courier candidates around pickup
  const nearbyBlips = [
    { id: 1, angle: 45, distanceRatio: 0.38, distKm: 1.2, type: "BIKE", name: "Bike Courier" },
    { id: 2, angle: 140, distanceRatio: 0.62, distKm: 2.8, type: "BIKE", name: "Bike Courier" },
    { id: 3, angle: 220, distanceRatio: 0.78, distKm: 3.9, type: order.vehicle_type, name: `${order.vehicle_type} Partner` },
    { id: 4, angle: 310, distanceRatio: 0.52, distKm: 2.3, type: "CARGO", name: "Cargo Van" },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-b from-card via-card/90 to-background p-6 shadow-2xl md:p-8">
      {/* Background ambient dispatch glow */}
      <div className="pointer-events-none absolute -left-20 -top-20 size-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 size-80 rounded-full bg-accent/10 blur-3xl" />

      {/* Top Header Bar */}
      <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="relative flex size-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Radio className="size-5 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-primary" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                Searching for Courier Rider
              </h2>
              <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
                Live Broadcast
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Broadcasting delivery request to nearby active couriers · Karachi Express Network
            </p>
          </div>
        </div>

        {/* Elapsed Timer Counter */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Broadcasting
          </span>
          <span className="font-mono text-base font-bold tabular-nums text-primary">
            {formatTimer(secondsElapsed)}
          </span>
        </div>
      </div>

      {/* Main Interactive Radar Area */}
      <div className="relative my-6 flex flex-col items-center justify-center md:my-8">
        {/* Radar Circular Visual Container with Live Map Behind */}
        <div className="relative flex size-72 items-center justify-center sm:size-80 md:size-96 rounded-full overflow-hidden border-2 border-primary/40 shadow-glow bg-card/60">
          {/* Ambient Map Layer */}
          <div ref={mapEl} className="absolute inset-0 size-full filter saturate-[0.8] contrast-[1.05]" />

          {/* Theme Tint Overlay for High Contrast */}
          <div className="pointer-events-none absolute inset-0 bg-background/55 backdrop-blur-[0.5px]" />

          {/* Sonar Expanding Waves */}
          <div className="pointer-events-none absolute size-48 rounded-full border border-primary/40 bg-primary/10 animate-radar-ripple-1" />
          <div className="pointer-events-none absolute size-48 rounded-full border border-primary/30 bg-primary/10 animate-radar-ripple-2" />
          <div className="pointer-events-none absolute size-48 rounded-full border border-primary/20 bg-primary/5 animate-radar-ripple-3" />

          {/* Concentric Distance Rings */}
          <div className="pointer-events-none absolute size-72 rounded-full border border-primary/30 sm:size-80 md:size-96">
            <span className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-card/90 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground shadow-2xs">
              5.0 km perimeter
            </span>
          </div>
          <div className="pointer-events-none absolute size-48 rounded-full border border-primary/25 sm:size-56 md:size-64">
            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-muted-foreground/80">
              3.0 km
            </span>
          </div>
          <div className="pointer-events-none absolute size-28 rounded-full border border-primary/20 sm:size-32 md:size-36">
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-muted-foreground/70">
              1.5 km
            </span>
          </div>

          {/* Crosshair Axes */}
          <div className="pointer-events-none absolute h-full w-px bg-primary/20" />
          <div className="pointer-events-none absolute h-px w-full bg-primary/20" />

          {/* Rotating Radar Sweep Cone (360 deg) */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full animate-radar-sweep"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 270deg, color-mix(in oklab, var(--primary) 15%, transparent) 320deg, color-mix(in oklab, var(--primary) 55%, transparent) 360deg)",
            }}
          />

          {/* Nearby Courier Blips */}
          {nearbyBlips.map((blip) => {
            const rad = (blip.angle * Math.PI) / 180;
            const maxR = 140;
            const r = maxR * blip.distanceRatio;
            const x = Math.cos(rad) * r;
            const y = Math.sin(rad) * r;

            return (
              <div
                key={blip.id}
                className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center cursor-pointer animate-radar-blip"
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                }}
                title={`${blip.name} (~${blip.distKm} km away)`}
              >
                <div className="relative flex size-7 items-center justify-center rounded-full border border-primary bg-primary/25 text-primary shadow-glow transition-transform hover:scale-125">
                  {blip.type === "CARGO" ? (
                    <Truck className="size-3.5" />
                  ) : (
                    <Bike className="size-3.5" />
                  )}
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
                </div>
                <span className="mt-1 rounded bg-background/90 px-1 py-0.5 text-[8px] font-semibold text-muted-foreground opacity-75 backdrop-blur group-hover:opacity-100">
                  {blip.distKm} km
                </span>
              </div>
            );
          })}

          {/* Center Pickup Beacon */}
          <div className="relative z-20 flex flex-col items-center">
            <div className="relative flex size-12 items-center justify-center rounded-full border-2 border-primary bg-background shadow-glow">
              <MapPin className="size-6 text-primary animate-bounce" />
            </div>
            <div className="mt-2 flex max-w-[150px] items-center gap-1 rounded-full border border-border bg-card/90 px-2.5 py-1 text-center text-[10px] font-semibold shadow-soft backdrop-blur">
              <span className="truncate">{order.pickup_address.split(",")[0]}</span>
            </div>
          </div>
        </div>

        {/* Live Status Broadcast Carousel Message */}
        <div className="relative mt-6 flex min-h-12 w-full max-w-md items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-center">
          <p className="animate-enter flex items-center justify-center gap-2 text-xs font-medium text-foreground sm:text-sm">
            <Sparkles className="size-4 shrink-0 text-primary animate-spin" style={{ animationDuration: "6s" }} />
            <span>{STATUS_MESSAGES[msgIndex]}</span>
          </p>
        </div>
      </div>

      {/* Automatic Dispatch Status Info Bar (No interactive perimeter buttons for customers) */}
      <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-bold text-foreground">
            <Compass className="size-4 text-primary" />
            <span>Broadcast Perimeter: 5.0 km</span>
          </span>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">· Real-time GPS courier matching in Karachi</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5 text-primary" />
            <span>Alerting nearby verified couriers</span>
          </span>
          {order.handle_with_care && (
            <span className="flex items-center gap-1 text-primary font-semibold">
              <ShieldCheck className="size-3.5" /> Handle with care enabled
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
