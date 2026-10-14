import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderEvent = Database["public"]["Tables"]["order_status_events"]["Row"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type VehicleType = Database["public"]["Enums"]["vehicle_type"];

export const STATUS_FLOW: OrderStatus[] = ["PENDING", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"];
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Waiting for a rider",
  ACCEPTED: "Rider assigned",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
export const ACTIVE_STATUSES: OrderStatus[] = ["PENDING", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"];

const pkr = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatPKR = (v: number | string) => `Rs. ${pkr.format(Number(v))}`;

export function progressOf(status: OrderStatus) {
  if (status === "CANCELLED") return 0;
  return ((STATUS_FLOW.indexOf(status) + 1) / STATUS_FLOW.length) * 100;
}

/** Turns backend error messages into readable text. */
export function friendlyError(e: unknown) {
  const msg = (e as { message?: string })?.message ?? String(e);
  return msg.replace(/^.*?ERROR:\s*/i, "");
}

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not signed in");
    const { data, error } = await supabase.from("profiles").select("id, full_name, is_active").eq("id", u.user.id).maybeSingle();
    if (error) throw error;
    return { id: u.user.id, email: u.user.email ?? "", full_name: data?.full_name || u.user.email?.split("@")[0] || "there", is_active: data?.is_active ?? true };
  },
});

export const myOrdersQuery = queryOptions({
  queryKey: ["orders", "mine"],
  queryFn: async () => {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  refetchInterval: 20000,
});

export const orderQuery = (id: string) =>
  queryOptions({
    queryKey: ["orders", id],
    queryFn: async () => {
      const [o, ev] = await Promise.all([
        supabase.from("orders").select("*").eq("id", id).maybeSingle(),
        supabase.from("order_status_events").select("*").eq("order_id", id).order("created_at"),
      ]);
      if (o.error) throw o.error;
      if (ev.error) throw ev.error;
      return { order: o.data, events: ev.data };
    },
    refetchInterval: 15000,
  });

export const orderRiderQuery = (id: string) =>
  queryOptions({
    queryKey: ["orders", id, "rider"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_order_rider", { p_order_id: id });
      if (error) throw new Error(friendlyError(error));
      return data?.[0] ?? null;
    },
  });

export const orderCustomerQuery = (id: string) =>
  queryOptions({
    queryKey: ["orders", id, "customer"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_order_customer", { p_order_id: id });
      if (error) throw new Error(friendlyError(error));
      return data?.[0] ?? null;
    },
  });

/** Next valid lifecycle step a rider may perform, or null when none. */
export const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  ACCEPTED: { status: "PICKED_UP", label: "Confirm pickup" },
  PICKED_UP: { status: "IN_TRANSIT", label: "Start transit" },
  IN_TRANSIT: { status: "DELIVERED", label: "Mark delivered" },
};

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { data, error } = await supabase.rpc("update_order_status", { p_order_id: id, p_status: status });
  if (error) throw new Error(friendlyError(error));
  return data;
}

export const serviceAreasQuery = queryOptions({
  queryKey: ["service_areas"],
  queryFn: async () => {
    const { data, error } = await supabase.from("service_areas").select("*").eq("is_active", true);
    if (error) throw error;
    return data;
  },
});

export interface Quote {
  service_area_name: string;
  distance_km: number;
  base_fare: number;
  per_km_rate: number;
  distance_fare: number;
  care_fee: number;
  total_fare: number;
  vehicle_type: VehicleType;
}

export interface BookingInput {
  pickup_address: string;
  pickup: { lat: number; lng: number };
  dropoff_address: string;
  dropoff: { lat: number; lng: number };
  recipient_name: string;
  recipient_phone: string;
  parcel_description: string;
  vehicle: VehicleType;
  care: boolean;
}

export async function fetchQuote(b: BookingInput): Promise<Quote> {
  const { data, error } = await supabase.rpc("quote_order", {
    p_pickup_lat: b.pickup.lat, p_pickup_lng: b.pickup.lng,
    p_dropoff_lat: b.dropoff.lat, p_dropoff_lng: b.dropoff.lng,
    p_vehicle: b.vehicle, p_care: b.care,
  });
  if (error) throw new Error(friendlyError(error));
  return data as unknown as Quote;
}

export async function createOrder(b: BookingInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_order", {
    p_pickup_address: b.pickup_address, p_pickup_lat: b.pickup.lat, p_pickup_lng: b.pickup.lng,
    p_dropoff_address: b.dropoff_address, p_dropoff_lat: b.dropoff.lat, p_dropoff_lng: b.dropoff.lng,
    p_recipient_name: b.recipient_name, p_recipient_phone: b.recipient_phone,
    p_parcel_description: b.parcel_description, p_vehicle: b.vehicle, p_care: b.care,
  });
  if (error || !data) throw new Error(friendlyError(error ?? "Booking failed"));
  return data as string;
}
