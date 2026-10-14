import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Refetches order-related caches when any visible order changes (RLS limits
 * which rows each user receives). Queries also poll as a fallback.
 */
export function useOrdersRealtime(keys: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  const sig = JSON.stringify(keys);
  useEffect(() => {
    const parsed = JSON.parse(sig) as unknown[][];
    const refresh = () => parsed.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    const ch = supabase
      .channel(`orders:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sig, qc]);
}
