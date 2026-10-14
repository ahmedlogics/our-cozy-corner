import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, Marker, Circle } from "leaflet";

export interface Pt {
  lat: number;
  lng: number;
}

export interface MapPickerProps {
  // Dual-pin support
  pickup?: Pt | null;
  dropoff?: Pt | null;
  activeMode?: "pickup" | "dropoff";
  pickupLabel?: string;
  dropoffLabel?: string;

  // Single-pin backwards compatibility
  value?: Pt | null;
  other?: Pt | null;
  tone?: "primary" | "accent";

  onChange: (p: Pt) => void;
  center: Pt;
  area?: { center: Pt; radiusKm: number } | undefined;
  label: string;
}

/** Interactive map picker with dual pins, smooth panning, and service area boundary */
export function MapPicker({
  pickup,
  dropoff,
  activeMode,
  pickupLabel = "Pickup location",
  dropoffLabel = "Drop-off destination",
  value,
  other,
  tone = "primary",
  onChange,
  center,
  area,
  label,
}: MapPickerProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const pickupMarker = useRef<Marker | null>(null);
  const dropoffMarker = useRef<Marker | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  // Resolve pins: prioritize dual pickup/dropoff props, fallback to single value/other
  const effectivePickup = pickup !== undefined ? pickup : (activeMode === "dropoff" ? other : value);
  const effectiveDropoff = dropoff !== undefined ? dropoff : (activeMode === "dropoff" ? value : other);

  const createIcon = (lib: typeof import("leaflet"), kind: "primary" | "accent" | "muted") =>
    lib.divIcon({
      className: "",
      html: `<div class="map-pin map-pin-${kind}"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -26],
    });

  // Initialize Map
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((lib) => {
      if (cancelled || !el.current || map.current) return;
      L.current = lib;
      const initialPt = effectivePickup || effectiveDropoff || center;
      const m = lib.map(el.current, { zoomControl: true }).setView([initialPt.lat, initialPt.lng], 12);

      lib.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);

      if (area) {
        const c: Circle = lib.circle([area.center.lat, area.center.lng], {
          radius: area.radiusKm * 1000,
          color: "#22c55e",
          weight: 1.5,
          dashArray: "4, 6",
          fillOpacity: 0.04,
        });
        c.addTo(m);
      }

      m.on("click", (e) => {
        cb.current({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
      });

      map.current = m;
      setTimeout(() => m.invalidateSize(), 60);
    });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      pickupMarker.current = null;
      dropoffMarker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronize Markers and Route
  useEffect(() => {
    const m = map.current;
    const lib = L.current;
    if (!m || !lib) return;

    // 1. Pickup Marker (Primary Brand Color)
    if (effectivePickup) {
      if (!pickupMarker.current) {
        pickupMarker.current = lib.marker([effectivePickup.lat, effectivePickup.lng], {
          icon: createIcon(lib, "primary"),
          title: "Pickup",
        }).addTo(m);
      } else {
        pickupMarker.current.setLatLng([effectivePickup.lat, effectivePickup.lng]);
      }
      pickupMarker.current.bindTooltip(`📍 ${pickupLabel}`, { permanent: false, direction: "top", offset: [0, -22] });
    } else if (pickupMarker.current) {
      m.removeLayer(pickupMarker.current);
      pickupMarker.current = null;
    }

    // 2. Dropoff Marker (Accent Color)
    if (effectiveDropoff) {
      if (!dropoffMarker.current) {
        dropoffMarker.current = lib.marker([effectiveDropoff.lat, effectiveDropoff.lng], {
          icon: createIcon(lib, "accent"),
          title: "Drop-off",
        }).addTo(m);
      } else {
        dropoffMarker.current.setLatLng([effectiveDropoff.lat, effectiveDropoff.lng]);
      }
      dropoffMarker.current.bindTooltip(`🏁 ${dropoffLabel}`, { permanent: false, direction: "top", offset: [0, -22] });
    } else if (dropoffMarker.current) {
      m.removeLayer(dropoffMarker.current);
      dropoffMarker.current = null;
    }

    // 3. Viewport Management: Pan or fit bounds
    if (effectivePickup && effectiveDropoff) {
      // Fit both pins nicely inside map view
      const bounds = lib.latLngBounds(
        [effectivePickup.lat, effectivePickup.lng],
        [effectiveDropoff.lat, effectiveDropoff.lng]
      );
      m.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else if (activeMode === "dropoff" && effectiveDropoff) {
      m.panTo([effectiveDropoff.lat, effectiveDropoff.lng]);
    } else if (effectivePickup) {
      m.panTo([effectivePickup.lat, effectivePickup.lng]);
    }
  }, [effectivePickup, effectiveDropoff, activeMode, pickupLabel, dropoffLabel]);

  return (
    <div
      ref={el}
      role="application"
      aria-label={label}
      className="relative h-80 w-full overflow-hidden rounded-2xl border border-border shadow-soft md:h-96"
    />
  );
}
