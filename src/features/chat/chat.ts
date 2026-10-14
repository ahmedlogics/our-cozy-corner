import { useEffect } from "react";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { friendlyError, type OrderStatus } from "@/features/orders/orders";

export type Message = Database["public"]["Tables"]["messages"]["Row"];

/** Chat rules: readable once a rider is assigned; sendable only during active delivery. */
export const CHAT_SEND_STATUSES: OrderStatus[] = ["ACCEPTED", "PICKED_UP", "IN_TRANSIT"];
export const canReadChat = (status: OrderStatus, riderId: string | null) => !!riderId && status !== "PENDING" && status !== "CANCELLED" || (!!riderId && status === "DELIVERED");
export const canSendChat = (status: OrderStatus, riderId: string | null) => !!riderId && CHAT_SEND_STATUSES.includes(status);

export const messagesQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["messages", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("*").eq("order_id", orderId).order("created_at");
      if (error) throw new Error(friendlyError(error));
      return data;
    },
    refetchInterval: 10000, // fallback if realtime is unavailable
  });

export async function sendMessage(orderId: string, body: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please sign in");
  const { data, error } = await supabase.from("messages").insert({ order_id: orderId, sender_id: u.user.id, body: body.trim() }).select().single();
  if (error) throw new Error(error.code === "42501" ? "Chat is closed for this order." : friendlyError(error));
  return data;
}

/** Subscribes to new messages for one order and merges them into the cache. */
export function useMessagesRealtime(orderId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`messages:${orderId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${orderId}` }, (payload) => {
        const m = payload.new as Message;
        qc.setQueryData<Message[]>(["messages", orderId], (old) => (old && !old.some((x) => x.id === m.id) ? [...old, m] : old ?? [m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, qc]);
}
