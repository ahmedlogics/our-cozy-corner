import { Link, useRouterState } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "default" | "light";
  to?: string;
}

export function Logo({ className, variant = "default", to }: LogoProps) {
  const isLight = variant === "light";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Intelligent destination: keep user inside their active dashboard portal
  const destination =
    to ??
    (pathname.startsWith("/rider")
      ? "/rider"
      : pathname.startsWith("/admin")
      ? "/admin"
      : pathname.startsWith("/customer")
      ? "/customer"
      : "/");

  return (
    <Link
      to={destination}
      className={cn("flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight transition-opacity hover:opacity-90", className)}
      aria-label="LogiPulse home"
    >
      {/* Small Courier Delivery Truck / Transport Vehicle Logomark */}
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#087F75] via-[#087F75] to-[#045952] text-white shadow-sm ring-1 ring-[#087F75]/35">
        <Truck className="size-5 text-white" strokeWidth={2.2} />
        {/* Subtle active pulse / transit dot in Champagne Gold */}
        <span className="absolute -top-0.5 -right-0.5 flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9A56B] opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-[#C9A56B]" />
        </span>
      </span>

      <span className={isLight ? "text-white" : "text-[#14283F]"}>
        Logi<span className="text-[#087F75]">Pulse</span>
      </span>
    </Link>
  );
}
