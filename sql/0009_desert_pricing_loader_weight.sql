-- ============================================================================
-- LogiPulse: Pricing Update (PKR), Cargo Loader Option, Weight & Schema Reload
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- ============================================================================

-- 1. Ensure columns exist on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parcel_weight_kg numeric(8,2) DEFAULT 1.0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loader_fee numeric(10,2) DEFAULT 0.0;

-- 2. Update Pricing Rules to user specifications:
--    Bike:  Base 100, Per-KM 25, Handle With Care 50
--    Cargo: Base 300, Per-KM 50, Handle With Care 100
INSERT INTO public.pricing_rules (vehicle_type, base_fare, per_km_rate, care_fee, is_active)
VALUES
  ('BIKE'::public.vehicle_type, 100.00, 25.00, 50.00, true),
  ('CARGO'::public.vehicle_type, 300.00, 50.00, 100.00, true)
ON CONFLICT (vehicle_type) DO UPDATE SET
  base_fare = EXCLUDED.base_fare,
  per_km_rate = EXCLUDED.per_km_rate,
  care_fee = EXCLUDED.care_fee,
  is_active = true,
  updated_at = now();

-- Also update any existing active records if no unique constraint exists
UPDATE public.pricing_rules
SET base_fare = 100.00, per_km_rate = 25.00, care_fee = 50.00, is_active = true, updated_at = now()
WHERE vehicle_type = 'BIKE'::public.vehicle_type;

UPDATE public.pricing_rules
SET base_fare = 300.00, per_km_rate = 50.00, care_fee = 100.00, is_active = true, updated_at = now()
WHERE vehicle_type = 'CARGO'::public.vehicle_type;

-- 3. Haversine distance calculator
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 2 * 6371.0088 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- 4. Quote Order function (with optional Cargo Loader fee of Rs. 100)
CREATE OR REPLACE FUNCTION public.quote_order(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_vehicle public.vehicle_type,
  p_care boolean DEFAULT false,
  p_loader boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
  r record;
  d numeric;
  bf numeric;
  df numeric;
  cf numeric;
  lf numeric := 0;
BEGIN
  IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL
     OR abs(p_pickup_lat) > 90 OR abs(p_dropoff_lat) > 90 OR abs(p_pickup_lng) > 180 OR abs(p_dropoff_lng) > 180 THEN
    RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE = '22023';
  END IF;
  IF p_vehicle IS NULL THEN
    RAISE EXCEPTION 'Choose a vehicle type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO a FROM public.service_areas s WHERE s.is_active
    AND public.haversine_km(s.center_lat, s.center_lng, p_pickup_lat, p_pickup_lng) <= s.radius_km
    AND public.haversine_km(s.center_lat, s.center_lng, p_dropoff_lat, p_dropoff_lng) <= s.radius_km
    ORDER BY s.created_at LIMIT 1;

  IF a IS NULL THEN
    RAISE EXCEPTION 'Pickup and drop-off must both be inside the same active service area' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.pricing_rules WHERE vehicle_type = p_vehicle AND is_active ORDER BY updated_at DESC LIMIT 1;
  IF r IS NULL THEN
    RAISE EXCEPTION 'No active pricing found for vehicle %', p_vehicle USING ERRCODE = '22023';
  END IF;

  d := round(public.haversine_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng)::numeric, 2);
  bf := round(r.base_fare, 2);
  df := round(d * r.per_km_rate, 2);
  cf := CASE WHEN coalesce(p_care, false) THEN round(r.care_fee, 2) ELSE 0 END;
  lf := CASE WHEN p_vehicle = 'CARGO' AND coalesce(p_loader, false) THEN 100.00 ELSE 0 END;

  RETURN jsonb_build_object(
    'service_area_id', a.id,
    'service_area_name', a.name,
    'distance_km', d,
    'base_fare', bf,
    'per_km_rate', r.per_km_rate,
    'distance_fare', df,
    'care_fee', cf,
    'loader_fee', lf,
    'total_fare', bf + df + cf + lf,
    'vehicle_type', p_vehicle
  );
END $$;

-- 5. Overload for backward compatibility with 6 parameters
CREATE OR REPLACE FUNCTION public.quote_order(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_vehicle public.vehicle_type,
  p_care boolean
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.quote_order(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng, p_vehicle, p_care, false);
END $$;

-- 6. Create Order function
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
  p_care boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  q jsonb;
  new_id uuid;
  is_loader boolean := (p_parcel_description ~* 'loader');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in to book' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_active) THEN
    RAISE EXCEPTION 'Your account is not active' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_pickup_address,''))) < 3 OR length(trim(coalesce(p_dropoff_address,''))) < 3 THEN
    RAISE EXCEPTION 'Enter both pickup and drop-off addresses' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_recipient_name,''))) < 2 THEN
    RAISE EXCEPTION 'Enter the recipient name' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_recipient_phone,'') !~ '^\+?[0-9 \-]{10,16}$' THEN
    RAISE EXCEPTION 'Enter a valid recipient phone' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_parcel_description,''))) < 2 THEN
    RAISE EXCEPTION 'Describe the parcel' USING ERRCODE = '22023';
  END IF;
  IF p_pickup_lat = p_dropoff_lat AND p_pickup_lng = p_dropoff_lng THEN
    RAISE EXCEPTION 'Pickup and drop-off cannot be the same point' USING ERRCODE = '22023';
  END IF;

  q := public.quote_order(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng, p_vehicle, coalesce(p_care, false), is_loader);

  INSERT INTO public.orders (
    customer_id, rider_id, service_area_id, pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng, recipient_name, recipient_phone,
    parcel_description, vehicle_type, handle_with_care, distance_km, base_fare,
    distance_fare, care_fee, total_fare, status, priority, loader_fee
  )
  VALUES (
    uid, NULL, (q->>'service_area_id')::uuid, trim(p_pickup_address), p_pickup_lat, p_pickup_lng,
    trim(p_dropoff_address), p_dropoff_lat, p_dropoff_lng, trim(p_recipient_name),
    trim(p_recipient_phone), trim(p_parcel_description), p_vehicle, coalesce(p_care, false),
    (q->>'distance_km')::numeric, (q->>'base_fare')::numeric, (q->>'distance_fare')::numeric,
    (q->>'care_fee')::numeric, (q->>'total_fare')::numeric, 'PENDING', 'NORMAL',
    coalesce((q->>'loader_fee')::numeric, 0)
  )
  RETURNING id INTO new_id;

  INSERT INTO public.order_status_events (order_id, status, note, created_by)
  VALUES (new_id, 'PENDING', 'Order placed — waiting for a courier', uid);

  RETURN new_id;
END $$;

-- 7. Permissions and schema cache refresh
REVOKE EXECUTE ON FUNCTION public.create_order FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_order TO authenticated, anon;
GRANT SELECT ON public.pricing_rules TO authenticated, anon;
GRANT UPDATE ON public.pricing_rules TO authenticated;

-- Notify PostgREST to immediately flush and reload its schema cache
NOTIFY pgrst, 'reload schema';
