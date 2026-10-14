import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { friendlyError } from "@/features/orders/orders";

export type Priority = Database["public"]["Enums"]["order_priority"];
export type AvailableOrder = Database["public"]["Functions"]["get_available_orders"]["Returns"][number] & {
  dropoff_address?: string;
  total_fare?: number | null;
  trip_distance_km?: number | null;
};
export const RADII = [1, 3, 5, 10, 20] as const;
export type SortMode = "nearest" | "priority";

export const riderProfileQuery = queryOptions({
  queryKey: ["rider", "profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not signed in");
    const [rp, p] = await Promise.all([
      supabase.from("rider_profiles").select("*").eq("user_id", u.user.id).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle(),
    ]);
    if (rp.error) throw rp.error;
    return { rider: rp.data, name: p.data?.full_name || u.user.email?.split("@")[0] || "Rider" };
  },
});

export const availableOrdersQuery = (radius: number, priority: Priority | null, sort: SortMode, locKey: string) =>
  queryOptions({
    queryKey: ["rider", "available", radius, priority, sort, locKey],
    queryFn: async (): Promise<AvailableOrder[]> => {
      const { data, error } = await supabase.rpc("get_available_orders", {
        p_radius_km: radius,
        p_sort: sort,
        ...(priority ? { p_priority: priority } : {}),
      });
      if (error) throw new Error(friendlyError(error));
      if (!data || data.length === 0) return [];

      // Query full order details for dropoff address, fare, and trip distance
      const ids = data.map((d) => d.id);
      const { data: fullDetails } = await supabase
        .from("orders")
        .select("id, dropoff_address, total_fare, distance_km")
        .in("id", ids);

      const map = new Map(fullDetails?.map((f) => [f.id, f]) ?? []);

      return data.map((d) => {
        const extra = map.get(d.id);
        return {
          ...d,
          dropoff_address: extra?.dropoff_address ?? "Karachi Delivery Point",
          total_fare: extra?.total_fare ? Number(extra.total_fare) : null,
          trip_distance_km: extra?.distance_km ? Number(extra.distance_km) : null,
        };
      });
    },
  });

export const riderJobsQuery = queryOptions({
  queryKey: ["rider", "jobs"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("orders").select("*").eq("rider_id", u.user!.id).order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

const call = async <T,>(p: PromiseLike<{ data: T; error: unknown }>) => {
  const { data, error } = await p;
  if (error) throw new Error(friendlyError(error));
  return data;
};
export const registerRider = (v: "BIKE" | "CARGO") => call(supabase.rpc("register_rider", { p_vehicle: v }));
export const saveLocation = (lat: number, lng: number, demo: boolean) => call(supabase.rpc("update_rider_location", { p_lat: lat, p_lng: lng, p_is_demo: demo }));
export const acceptOrder = (id: string) => call(supabase.rpc("accept_order", { p_order_id: id }));
