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

export const adminStatsQuery = queryOptions({
  queryKey: ["admin", "stats"],
  queryFn: async (): Promise<AdminStats> => {
    const stats = await rpc<AdminStats>(supabase.rpc("admin_stats"));
    try {
      const [profilesRes, ridersRes, rolesRes, ordersRes] = await Promise.all([
        supabase.from("profiles").select("id"),
        supabase.from("rider_profiles").select("user_id"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("orders").select("customer_id"),
      ]);
      if (profilesRes.data) {
        const riderIds = new Set((ridersRes.data ?? []).map((r) => r.user_id));
        const adminIds = new Set((rolesRes.data ?? []).filter((r) => r.role === "admin").map((a) => a.user_id));
        const customerRoleIds = new Set((rolesRes.data ?? []).filter((r) => r.role === "customer").map((c) => c.user_id));
        const orderingCustomerIds = new Set((ordersRes.data ?? []).map((o) => o.customer_id).filter(Boolean));

        const count = profilesRes.data.filter((p) =>
          customerRoleIds.has(p.id) ||
          orderingCustomerIds.has(p.id) ||
          (!adminIds.has(p.id) && !riderIds.has(p.id))
        ).length;

        if (count > 0) {
          stats.total_customers = Math.max(stats.total_customers ?? 0, count);
        }
      }
    } catch {
      // keep stats as is
    }
    return stats;
  },
  refetchInterval: 30000,
});

export const adminOrdersQuery = queryOptions({ queryKey: ["admin", "orders"], queryFn: () => rpc<AdminOrder[]>(supabase.rpc("admin_list_orders")), refetchInterval: 30000 });
export const adminRidersQuery = queryOptions({ queryKey: ["admin", "riders"], queryFn: () => rpc<AdminRider[]>(supabase.rpc("admin_list_riders")), refetchInterval: 30000 });

export const adminCustomersQuery = queryOptions({
  queryKey: ["admin", "customers"],
  queryFn: async (): Promise<AdminCustomer[]> => {
    // 1. Try authoritative RPC first
    let rpcCustomers: AdminCustomer[] = [];
    try {
      const { data, error } = await supabase.rpc("admin_list_customers");
      if (!error && Array.isArray(data)) {
        rpcCustomers = data as AdminCustomer[];
      }
    } catch {
      // Continue to fallback
    }

    // 2. Fetch direct profiles, orders, and roles to ensure ANY account with orders
    // or standard customer role is included (e.g. if an admin/tester placed orders or RPC skipped them)
    try {
      const [profilesRes, ridersRes, rolesRes, ordersRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, is_active, created_at").order("created_at", { ascending: false }),
        supabase.from("rider_profiles").select("user_id"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("orders").select("id, customer_id, created_at"),
      ]);

      if (profilesRes.data && profilesRes.data.length > 0) {
        const riderIds = new Set((ridersRes.data ?? []).map((r) => r.user_id));
        const adminIds = new Set((rolesRes.data ?? []).filter((r) => r.role === "admin").map((a) => a.user_id));
        const customerRoleIds = new Set((rolesRes.data ?? []).filter((r) => r.role === "customer").map((c) => c.user_id));
        const orders = ordersRes.data ?? [];
        const orderingCustomerIds = new Set(orders.map((o) => o.customer_id).filter(Boolean));

        // Accounts that should appear in the Customers list:
        // - Explicit customer role
        // - OR placed an order (e.g. testing)
        // - OR general profile (not admin, not rider)
        const eligibleProfiles = profilesRes.data.filter((p) =>
          customerRoleIds.has(p.id) ||
          orderingCustomerIds.has(p.id) ||
          (!adminIds.has(p.id) && !riderIds.has(p.id))
        );

        if (eligibleProfiles.length > 0) {
          const directCustomers: AdminCustomer[] = eligibleProfiles.map((p) => {
            const userOrders = orders.filter((o) => o.customer_id === p.id);
            const sortedDates = userOrders
              .map((o) => o.created_at)
              .filter(Boolean)
              .sort()
              .reverse();

            const isStaffTesting = (adminIds.has(p.id) || riderIds.has(p.id)) && userOrders.length > 0;
            const displayName = isStaffTesting ? `${p.full_name || "Account"} (Staff Test)` : (p.full_name || "Customer");

            return {
              user_id: p.id,
              full_name: displayName,
              phone: p.phone ?? null,
              account_active: p.is_active ?? true,
              order_count: userOrders.length,
              last_order_at: sortedDates[0] ?? null,
            };
          });

          // Merge with RPC results if RPC returned some items, de-duplicating by user_id
          const directMap = new Map(directCustomers.map((c) => [c.user_id, c]));
          for (const rpcC of rpcCustomers) {
            if (!directMap.has(rpcC.user_id)) {
              directMap.set(rpcC.user_id, rpcC);
            }
          }

          return Array.from(directMap.values());
        }
      }
    } catch (e) {
      console.warn("Direct customer query fallback error:", e);
    }

    if (rpcCustomers.length > 0) {
      return rpcCustomers;
    }

    // 3. Fallback to RPC call
    const { data, error } = await supabase.rpc("admin_list_customers");
    if (error) throw new Error(friendlyError(error));
    return (data as AdminCustomer[]) ?? [];
  },
  refetchInterval: 15000,
});

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

