import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/features/orders/orders";

export interface AdminStats { orders_today: number; pending: number; active: number; delivered: number; active_riders: number }

export const adminStatsQuery = queryOptions({
  queryKey: ["admin", "stats"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_stats");
    if (error) throw new Error(friendlyError(error));
    return data as unknown as AdminStats;
  },
  retry: false,
  refetchInterval: 20000,
});

export const adminOrdersQuery = queryOptions({
  queryKey: ["admin", "orders"],
  queryFn: async () => {
    const { data, error } = await supabase.from("orders").select("*").order("updated_at", { ascending: false }).limit(50);
    if (error) throw new Error(friendlyError(error));
    return data;
  },
  refetchInterval: 20000,
});
