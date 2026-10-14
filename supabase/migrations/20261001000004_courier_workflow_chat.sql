-- LogiPulse Phase 5: atomic acceptance, validated lifecycle, rider info, order chat, realtime.
-- Safe to run more than once. Run in your Supabase SQL editor.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS in_transit_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.rider_profiles ADD COLUMN IF NOT EXISTS plate_number text;

-- Hard guarantee: one active order per rider (MVP policy).
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_active_per_rider
  ON public.orders(rider_id) WHERE status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT');
CREATE INDEX IF NOT EXISTS orders_rider_idx ON public.orders(rider_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles; o public.orders;
BEGIN
  r := public.require_active_rider();
  PERFORM pg_advisory_xact_lock(hashtext('rider:' || r.user_id::text));
  IF EXISTS (SELECT 1 FROM public.orders WHERE rider_id = r.user_id AND status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT')) THEN
    RAISE EXCEPTION 'Finish your current delivery before accepting another' USING ERRCODE='22023'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'PENDING' OR o.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'This order is no longer available' USING ERRCODE='22023'; END IF;
  IF o.vehicle_type <> r.vehicle_type THEN RAISE EXCEPTION 'This order needs a % rider', o.vehicle_type USING ERRCODE='42501'; END IF;
  UPDATE public.orders SET rider_id = r.user_id, status = 'ACCEPTED', accepted_at = now(), updated_at = now()
    WHERE id = o.id AND status = 'PENDING' AND rider_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This order is no longer available' USING ERRCODE='22023'; END IF;
  INSERT INTO public.order_status_events (order_id, status, note, created_by) VALUES (o.id, 'ACCEPTED', 'Rider accepted the order', r.user_id);
  RETURN o.id;
END $$;

CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_status public.order_status)
RETURNS public.order_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles; o public.orders; nxt public.order_status; msg text;
BEGIN
  r := public.require_active_rider();
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.rider_id IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'You are not assigned to this order' USING ERRCODE='42501'; END IF;
  nxt := CASE o.status WHEN 'ACCEPTED' THEN 'PICKED_UP'::public.order_status
                       WHEN 'PICKED_UP' THEN 'IN_TRANSIT'::public.order_status
                       WHEN 'IN_TRANSIT' THEN 'DELIVERED'::public.order_status END;
  IF nxt IS NULL THEN RAISE EXCEPTION 'This order can no longer be updated' USING ERRCODE='22023'; END IF;
  IF p_status IS DISTINCT FROM nxt THEN RAISE EXCEPTION 'Invalid status change: next step is %', nxt USING ERRCODE='22023'; END IF;
  msg := CASE nxt WHEN 'PICKED_UP' THEN 'Parcel picked up' WHEN 'IN_TRANSIT' THEN 'On the way to drop-off' ELSE 'Delivered' END;
  UPDATE public.orders SET status = nxt, updated_at = now(),
    picked_up_at = CASE WHEN nxt = 'PICKED_UP' THEN now() ELSE picked_up_at END,
    in_transit_at = CASE WHEN nxt = 'IN_TRANSIT' THEN now() ELSE in_transit_at END,
    delivered_at = CASE WHEN nxt = 'DELIVERED' THEN now() ELSE delivered_at END
  WHERE id = o.id;
  INSERT INTO public.order_status_events (order_id, status, note, created_by) VALUES (o.id, nxt, msg, r.user_id);
  RETURN nxt;
END $$;

CREATE OR REPLACE FUNCTION public.get_order_rider(p_order_id uuid)
RETURNS TABLE (rider_id uuid, full_name text, phone text, vehicle_type public.vehicle_type, plate_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.rider_id, COALESCE(NULLIF(p.full_name,''),'Your rider'), p.phone, rp.vehicle_type, rp.plate_number
  FROM public.orders o
  JOIN public.rider_profiles rp ON rp.user_id = o.rider_id
  LEFT JOIN public.profiles p ON p.id = o.rider_id
  WHERE o.id = p_order_id AND o.rider_id IS NOT NULL
    AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
$$;

CREATE OR REPLACE FUNCTION public.get_order_customer(p_order_id uuid)
RETURNS TABLE (customer_id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.customer_id, COALESCE(NULLIF(p.full_name,''),'Customer')
  FROM public.orders o LEFT JOIN public.profiles p ON p.id = o.customer_id
  WHERE o.id = p_order_id AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
$$;

CREATE OR REPLACE FUNCTION public.set_rider_plate(p_plate text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles;
BEGIN
  r := public.require_active_rider();
  UPDATE public.rider_profiles SET plate_number = NULLIF(left(trim(p_plate), 20), '') WHERE user_id = r.user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'orders_today', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day', now())),
    'pending', (SELECT count(*) FROM public.orders WHERE status = 'PENDING'),
    'active', (SELECT count(*) FROM public.orders WHERE status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT')),
    'delivered', (SELECT count(*) FROM public.orders WHERE status = 'DELIVERED'),
    'active_riders', (SELECT count(*) FROM public.rider_profiles WHERE is_active)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.accept_order(uuid), public.update_order_status(uuid, public.order_status), public.get_order_rider(uuid), public.get_order_customer(uuid), public.set_rider_plate(text), public.admin_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.accept_order(uuid), public.update_order_status(uuid, public.order_status), public.get_order_rider(uuid), public.get_order_customer(uuid), public.set_rider_plate(text), public.admin_stats() TO authenticated;

-- Chat
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_order_idx ON public.messages(order_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants read messages" ON public.messages;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.rider_id IS NOT NULL
    AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid())));

DROP POLICY IF EXISTS "participants send during active delivery" ON public.messages;
CREATE POLICY "participants send during active delivery" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND o.rider_id IS NOT NULL AND o.status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT')
    AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid())));

-- Realtime
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['orders','order_status_events','messages'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
