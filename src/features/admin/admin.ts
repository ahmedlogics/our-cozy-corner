import { queryOptions } from "@tanstack/react-query";
import { BarChart3, Bike, Flame, Package, Users } from "lucide-react";
import type { NavItem } from "@/components/layout/DashboardShell";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { friendlyError } from "@/features/orders/orders";
import type { Priority } from "@/features/priority/priority";

type Fns = Database["public"]["Functions"];
export type AdminOrder = Fns["admin_list_orders"]["Returns"][number];
export type AdminRider = Fns["admin_list_riders"]["Returns"][number];
export type AdminCustomer = Fns["admin_list_customers"]["Returns"][number];

export interface AdminStats {
  total_orders: number; orders_today: number; pending: number; active: number; delivered: number; cancelled: number;
  total_customers: number; total_riders: number; active_riders: number;
  open_normal: number; open_high: number; open_urgent: number;
  all_normal: number; all_high: number; all_urgent: number;
  daily: { day: string; orders: number }[];
}

export type AdminSection = "overview" | "orders" | "riders" | "customers" | "priority";
export const adminNav = (active: AdminSection): NavItem[] => [
  { label: "Overview", icon: BarChart3, to: "/admin", active: active === "overview" },
  { label: "Orders", icon: Package, to: "/admin/orders", active: active === "orders" },
  { label: "Riders", icon: Bike, to: "/admin/riders", active: active === "riders" },
  { label: "Customers", icon: Users, to: "/admin/customers", active: active === "customers" },
  { label: "Priority", icon: Flame, to: "/admin/priority", active: active === "priority" },
];

const rpc = async <T,>(p: PromiseLike<{ data: unknown; error: unknown }>) => {
  const { data, error } = await p;
  if (error) throw new Error(friendlyError(error));
  return data as T;
};

export async function isAdmin() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  return data === true;
}

export const adminStatsQuery = queryOptions({ queryKey: ["admin", "stats"], queryFn: () => rpc<AdminStats>(supabase.rpc("admin_stats")), refetchInterval: 30000 });
export const adminOrdersQuery = queryOptions({ queryKey: ["admin", "orders"], queryFn: () => rpc<AdminOrder[]>(supabase.rpc("admin_list_orders")), refetchInterval: 30000 });
export const adminRidersQuery = queryOptions({ queryKey: ["admin", "riders"], queryFn: () => rpc<AdminRider[]>(supabase.rpc("admin_list_riders")), refetchInterval: 30000 });
export const adminCustomersQuery = queryOptions({ queryKey: ["admin", "customers"], queryFn: () => rpc<AdminCustomer[]>(supabase.rpc("admin_list_customers")) });

export const setOrderPriority = (id: string, p: Priority) => rpc<Priority>(supabase.rpc("update_order_priority", { p_order_id: id, p_priority: p }));
export const setAccountActive = (id: string, active: boolean) => rpc<void>(supabase.rpc("admin_set_account_active", { p_user_id: id, p_active: active }));

/** Priority can only change while an order is still open. */
export const canChangePriority = (status: string) => status !== "DELIVERED" && status !== "CANCELLED";

export const orderRef = (id: string) => id.slice(0, 8).toUpperCase();

export function filterOrders(orders: AdminOrder[], f: { q: string; status: string; priority: string }) {
  const q = f.q.trim().toUpperCase().replace(/^#/, "");
  return orders.filter((o) => (!q || orderRef(o.id).includes(q) || o.id.toUpperCase().includes(q)) && (f.status === "ALL" || o.status === f.status) && (f.priority === "ALL" || o.priority === f.priority));
}

export type PricingRule = Database["public"]["Tables"]["pricing_rules"]["Row"];

export const pricingRulesQuery = queryOptions({
  queryKey: ["admin", "pricing_rules"],
  queryFn: async () => {
    const { data, error } = await supabase.from("pricing_rules").select("*").order("vehicle_type");
    if (error) {
      if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
        return [
          { id: "1", vehicle_type: "BIKE" as const, base_fare: 100, per_km_rate: 25, care_fee: 50, is_active: true, updated_at: new Date().toISOString() },
          { id: "2", vehicle_type: "CARGO" as const, base_fare: 300, per_km_rate: 50, care_fee: 100, is_active: true, updated_at: new Date().toISOString() },
        ];
      }
      throw error;
    }
    return data;
  },
});

export async function updatePricingRule(rule: { vehicle_type: "BIKE" | "CARGO"; base_fare: number; per_km_rate: number; care_fee: number }) {
  const { data, error } = await supabase
    .from("pricing_rules")
    .upsert({
      vehicle_type: rule.vehicle_type,
      base_fare: rule.base_fare,
      per_km_rate: rule.per_km_rate,
      care_fee: rule.care_fee,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "vehicle_type" })
    .select();
  if (error) throw new Error(friendlyError(error));
  return data;
}

