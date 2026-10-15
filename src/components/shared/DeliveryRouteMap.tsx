import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap } from "leaflet";
import { Navigation, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeliveryRouteMapProps {
  pickup: { lat: number; lng: number; address?: string };
  dropoff: { lat: number; lng: number; address?: string };
  status?: string;
  className?: string;
}

export function DeliveryRouteMap({ pickup, dropoff, status, className }: DeliveryRouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LMap | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !mapContainer.current) return;

      // Clean up previous instance
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }

      // Initialize map
      const centerLat = (pickup.lat + dropoff.lat) / 2;
      const centerLng = (pickup.lng + dropoff.lng) / 2;
      const map = L.map(mapContainer.current, {
        center: [centerLat, centerLng],
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Custom markers
      const pickupIcon = L.divIcon({
        className: "pickup-marker-icon",
        html: `
          <div style="background-color: #087F75; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(8,127,117,0.35); border: 2.5px solid #ffffff;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -34],
      });

      const dropoffIcon = L.divIcon({
        className: "dropoff-marker-icon",
        html: `
          <div style="background-color: #14283F; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(20,40,63,0.35); border: 2.5px solid #ffffff;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -34],
      });

      const pMarker = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon }).addTo(map);
      pMarker.bindPopup(`<b>Pickup Location</b><br/>${pickup.address ?? "Pickup"}`);

      const dMarker = L.marker([dropoff.lat, dropoff.lng], { icon: dropoffIcon }).addTo(map);
      dMarker.bindPopup(`<b>Drop-off Destination</b><br/>${dropoff.address ?? "Drop-off"}`);

      // Polyline connecting points
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ],
        {
          color: "#087F75",
          weight: 4,
          opacity: 0.85,
          dashArray: "6, 8",
        }
      ).addTo(map);

      // Fit bounds
      const bounds = L.latLngBounds([
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ]);
      map.fitBounds(bounds, { padding: [45, 45] });

      mapInstance.current = map;
    });

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, pickup.address, dropoff.address]);

  const navUrl =
    status === "ACCEPTED"
      ? `https://www.google.com/maps/dir/?api=1&destination=${pickup.lat},${pickup.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dropoff.lat},${dropoff.lng}`;

  const navLabel =
    status === "ACCEPTED" ? "Navigate to Pickup (Google Maps)" : "Navigate to Drop-off (Google Maps)";

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div ref={mapContainer} className="h-64 sm:h-80 w-full z-0" />
        
        {/* Floating action overlay */}
        <div className="absolute bottom-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card/90 backdrop-blur p-2.5 shadow-md border border-border">
          <div className="text-xs">
            <span className="font-semibold text-foreground">Delivery Navigation</span>
            <p className="text-[11px] text-muted-foreground truncate max-w-[200px] sm:max-w-xs">
              {status === "ACCEPTED" ? `To: ${pickup.address}` : `To: ${dropoff.address}`}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant="hero"
            className="text-xs h-8 gap-1.5"
          >
            <a href={navUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-3.5" />
              <span>{navLabel}</span>
              <ExternalLink className="size-3 opacity-70" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
