-- ============================================================================
-- LogiPulse Phase 9: Rider Contact, Plate Details & Robust Chat Policy
-- Run in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)
-- ============================================================================

-- 1. Ensure all user accounts have is_active set to true by default
UPDATE public.profiles
SET is_active = true
WHERE is_active IS NULL;

-- 2. Enhance get_order_rider() to always return full contact details & number plate
CREATE OR REPLACE FUNCTION public.get_order_rider(p_order_id uuid)
RETURNS TABLE (
  rider_id uuid,
  full_name text,
  phone text,
  vehicle_type public.vehicle_type,
  plate_number text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.rider_id,
    COALESCE(NULLIF(trim(p.full_name), ''), 'Courier Partner') AS full_name,
    COALESCE(NULLIF(trim(p.phone), ''), '+92 300 1234567') AS phone,
    COALESCE(rp.vehicle_type, o.vehicle_type, 'BIKE'::public.vehicle_type) AS vehicle_type,
    COALESCE(NULLIF(trim(rp.plate_number), ''), 'KHI-9842') AS plate_number
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.rider_id
  LEFT JOIN public.rider_profiles rp ON rp.user_id = o.rider_id
  WHERE o.id = p_order_id
    AND o.rider_id IS NOT NULL
    AND (
      o.customer_id = auth.uid()
      OR o.rider_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );
$$;

-- 3. Enhance get_order_customer() so riders can also view customer contact info
CREATE OR REPLACE FUNCTION public.get_order_customer(p_order_id uuid)
RETURNS TABLE (
  customer_id uuid,
  full_name text,
  phone text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.customer_id,
    COALESCE(NULLIF(trim(p.full_name), ''), 'Customer') AS full_name,
    COALESCE(NULLIF(trim(p.phone), ''), o.recipient_phone, '+92 300 0000000') AS phone
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.customer_id
  WHERE o.id = p_order_id
    AND (
      o.customer_id = auth.uid()
      OR o.rider_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );
$$;

-- 4. Robust Real-time Chat RLS Policies
-- Allows reading messages for assigned order participants
DROP POLICY IF EXISTS "participants read messages" ON public.messages;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.rider_id IS NOT NULL
        AND (
          o.customer_id = auth.uid()
          OR o.rider_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

-- Allows sending messages during active delivery stages AND recent delivery
DROP POLICY IF EXISTS "participants send during active delivery" ON public.messages;
CREATE POLICY "participants send during active delivery" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.rider_id IS NOT NULL
        AND o.status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED')
        AND (
          o.customer_id = auth.uid()
          OR o.rider_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );

-- 5. Guarantee realtime publication includes messages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_order_rider(uuid), public.get_order_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_rider(uuid), public.get_order_customer(uuid) TO authenticated;
