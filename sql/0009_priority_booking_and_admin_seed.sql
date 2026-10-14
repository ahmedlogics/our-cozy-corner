-- ============================================================================
-- LogiPulse Phase 10: Priority Booking Support & Workflow Alignment
-- Run in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)
-- ============================================================================

-- 1. Upgrade create_order() to accept custom priority (NORMAL, HIGH, URGENT)
CREATE OR REPLACE FUNCTION public.create_order(
  p_pickup_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_recipient_name text,
  p_recipient_phone text,
  p_parcel_description text,
  p_vehicle public.vehicle_type,
  p_care boolean,
  p_priority public.order_priority DEFAULT 'NORMAL'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  q jsonb;
  new_id uuid;
  v_priority public.order_priority;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in to book' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND COALESCE(is_active, true)) THEN
    RAISE EXCEPTION 'Your account is not active' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(p_pickup_address,''))) < 3 OR length(trim(coalesce(p_dropoff_address,''))) < 3 THEN
    RAISE EXCEPTION 'Enter both pickup and drop-off addresses' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_recipient_name,''))) < 2 THEN RAISE EXCEPTION 'Enter the recipient name' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_recipient_phone,'') !~ '^\+?[0-9 \-]{10,16}$' THEN RAISE EXCEPTION 'Enter a valid recipient phone' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_parcel_description,''))) < 2 THEN RAISE EXCEPTION 'Describe the parcel' USING ERRCODE = '22023'; END IF;
  IF p_pickup_lat = p_dropoff_lat AND p_pickup_lng = p_dropoff_lng THEN RAISE EXCEPTION 'Pickup and drop-off cannot be the same point' USING ERRCODE = '22023'; END IF;

  v_priority := COALESCE(p_priority, 'NORMAL'::public.order_priority);

  q := public.quote_order(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng, p_vehicle, coalesce(p_care, false));

  INSERT INTO public.orders (
    customer_id, rider_id, service_area_id,
    pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    recipient_name, recipient_phone, parcel_description,
    vehicle_type, handle_with_care, distance_km,
    base_fare, distance_fare, care_fee, total_fare,
    status, priority
  ) VALUES (
    uid, NULL, (q->>'service_area_id')::uuid,
    trim(p_pickup_address), p_pickup_lat, p_pickup_lng,
    trim(p_dropoff_address), p_dropoff_lat, p_dropoff_lng,
    trim(p_recipient_name), trim(p_recipient_phone), trim(p_parcel_description),
    p_vehicle, coalesce(p_care, false),
    (q->>'distance_km')::numeric, (q->>'base_fare')::numeric, (q->>'distance_fare')::numeric, (q->>'care_fee')::numeric, (q->>'total_fare')::numeric,
    'PENDING', v_priority
  )
  RETURNING id INTO new_id;

  INSERT INTO public.order_status_events (order_id, status, note, created_by)
  VALUES (new_id, 'PENDING', format('Order placed with %s priority — waiting for a rider', v_priority), uid);

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_order FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_order TO authenticated;
