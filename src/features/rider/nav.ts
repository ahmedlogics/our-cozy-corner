import { Radar, PackageCheck } from "lucide-react";
import type { NavItem } from "@/components/layout/DashboardShell";

export const riderNav = (active: "nearby" | "jobs"): NavItem[] => [
  { label: "Nearby pickups", icon: Radar, to: "/rider", active: active === "nearby" },
  { label: "My jobs", icon: PackageCheck, to: "/rider/jobs", active: active === "jobs" },
];
