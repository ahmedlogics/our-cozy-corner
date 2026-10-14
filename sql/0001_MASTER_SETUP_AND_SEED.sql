-- ============================================================================
-- LogiPulse: MASTER SETUP & ADMIN SEED SCRIPT
-- SENTEC 2025 · The Engineer's Code
-- ============================================================================
-- INSTRUCTIONS:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/bpchwkdkwasasifsubtu
-- 2. Go to "SQL Editor" on the left menu -> Click "New query"
-- 3. Paste this ENTIRE script and click "RUN" (or Ctrl + Enter).
-- 4. That's it! All tables, RPC functions, Realtime replication, and Admin
--    accounts will be created and immediately usable.
-- ============================================================================

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'app_role' AND n.nspname = 'public') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'customer', 'rider');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'vehicle_type' AND n.nspname = 'public') THEN
    CREATE TYPE public.vehicle_type AS ENUM ('BIKE', 'CARGO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'order_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.order_status AS ENUM ('PENDING', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'order_priority' AND n.nspname = 'public') THEN
    CREATE TYPE public.order_priority AS ENUM ('NORMAL', 'HIGH', 'URGENT');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TABLES & PERMISSIONS
-- ----------------------------------------------------------------------------

-- 2.1 Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2.2 User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Role check helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_my_primary_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'anon'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN RETURN 'admin'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'rider')
     OR EXISTS (SELECT 1 FROM public.rider_profiles WHERE user_id = auth.uid()) THEN RETURN 'rider'; END IF;
  RETURN 'customer';
END $$;

REVOKE EXECUTE ON FUNCTION public.get_my_primary_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_primary_role() TO authenticated;

-- Policies for Profiles & Roles
DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own roles read" ON public.user_roles;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 2.3 Service Areas
CREATE TABLE IF NOT EXISTS public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  radius_km numeric NOT NULL CHECK (radius_km > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_areas TO authenticated, anon;
GRANT ALL ON public.service_areas TO service_role;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "areas readable" ON public.service_areas;
CREATE POLICY "areas readable" ON public.service_areas FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admins manage areas" ON public.service_areas;
CREATE POLICY "admins manage areas" ON public.service_areas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2.4 Pricing Rules
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type public.vehicle_type NOT NULL UNIQUE,
  base_fare numeric(10,2) NOT NULL CHECK (base_fare >= 0),
  per_km_rate numeric(10,2) NOT NULL CHECK (per_km_rate >= 0),
  care_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (care_fee >= 0),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_rules TO authenticated, anon;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing readable" ON public.pricing_rules;
CREATE POLICY "pricing readable" ON public.pricing_rules FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admins manage pricing" ON public.pricing_rules;
CREATE POLICY "admins manage pricing" ON public.pricing_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2.5 Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  rider_id uuid,
  service_area_id uuid NOT NULL REFERENCES public.service_areas(id),
  pickup_address text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  dropoff_address text NOT NULL,
  dropoff_lat double precision NOT NULL,
  dropoff_lng double precision NOT NULL,
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  parcel_description text NOT NULL,
  vehicle_type public.vehicle_type NOT NULL,
  handle_with_care boolean NOT NULL DEFAULT false,
  distance_km numeric(10,2) NOT NULL CHECK (distance_km > 0),
  base_fare numeric(10,2) NOT NULL,
  distance_fare numeric(10,2) NOT NULL,
  care_fee numeric(10,2) NOT NULL DEFAULT 0,
  total_fare numeric(10,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'PENDING',
  priority public.order_priority NOT NULL DEFAULT 'NORMAL',
  accepted_at timestamptz,
  picked_up_at timestamptz,
  in_transit_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_active_per_rider
  ON public.orders(rider_id) WHERE status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT');
CREATE INDEX IF NOT EXISTS orders_rider_idx ON public.orders(rider_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status, priority);

DROP POLICY IF EXISTS "orders viewable by participants" ON public.orders;
CREATE POLICY "orders viewable by participants" ON public.orders FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR rider_id = auth.uid()
    OR (status = 'PENDING' AND rider_id IS NULL)
    OR public.has_role(auth.uid(), 'admin')
  );

-- 2.6 Order Status Events
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_status_events TO authenticated;
GRANT ALL ON public.order_status_events TO service_role;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events viewable by participants" ON public.order_status_events;
CREATE POLICY "events viewable by participants" ON public.order_status_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- 2.7 Rider Profiles
CREATE TABLE IF NOT EXISTS public.rider_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_type public.vehicle_type NOT NULL DEFAULT 'BIKE',
  plate_number text,
  is_active boolean NOT NULL DEFAULT true,
  current_lat double precision,
  current_lng double precision,
  location_is_demo boolean NOT NULL DEFAULT false,
  location_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_lat_ok CHECK (current_lat IS NULL OR current_lat BETWEEN -90 AND 90),
  CONSTRAINT rider_lng_ok CHECK (current_lng IS NULL OR current_lng BETWEEN -180 AND 180)
);
GRANT SELECT ON public.rider_profiles TO authenticated;
GRANT ALL ON public.rider_profiles TO service_role;
ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rider reads own profile" ON public.rider_profiles;
CREATE POLICY "rider reads own profile" ON public.rider_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 2.8 Chat Messages
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
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.rider_id IS NOT NULL
        AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "participants send during active delivery" ON public.messages;
CREATE POLICY "participants send during active delivery" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.rider_id IS NOT NULL
        AND o.status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED')
        AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ----------------------------------------------------------------------------
-- 3. CORE LOGISTICS & PRICING FUNCTIONS
-- ----------------------------------------------------------------------------

-- Haversine great-circle calculation (R = 6,371 km)
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 2 * 6371 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2)^2 +
      cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2)^2
    )
  );
$$;

-- Quote Order
CREATE OR REPLACE FUNCTION public.quote_order(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_vehicle public.vehicle_type,
  p_care boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_area public.service_areas;
  v_rule public.pricing_rules;
  v_dist numeric;
  v_base numeric;
  v_per_km numeric;
  v_care_fee numeric := 0;
  v_dist_fare numeric;
  v_total numeric;
BEGIN
  SELECT * INTO v_area FROM public.service_areas
  WHERE is_active AND public.haversine_km(center_lat, center_lng, p_pickup_lat, p_pickup_lng) <= radius_km
  LIMIT 1;

  IF v_area IS NULL THEN RAISE EXCEPTION 'Pickup is outside our active delivery area' USING ERRCODE = '22023'; END IF;
  IF public.haversine_km(v_area.center_lat, v_area.center_lng, p_dropoff_lat, p_dropoff_lng) > v_area.radius_km THEN
    RAISE EXCEPTION 'Drop-off is outside our active delivery area' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_rule FROM public.pricing_rules WHERE vehicle_type = p_vehicle AND is_active;
  IF v_rule IS NULL THEN RAISE EXCEPTION 'Vehicle pricing rule not found' USING ERRCODE = '22023'; END IF;

  v_dist := round(public.haversine_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng)::numeric, 2);
  IF v_dist <= 0 THEN RAISE EXCEPTION 'Pickup and drop-off cannot be the same spot' USING ERRCODE = '22023'; END IF;

  v_base := v_rule.base_fare;
  v_per_km := v_rule.per_km_rate;
  IF coalesce(p_care, false) THEN v_care_fee := v_rule.care_fee; END IF;
  v_dist_fare := round(v_dist * v_per_km, 2);
  v_total := round(v_base + v_dist_fare + v_care_fee, 2);

  RETURN jsonb_build_object(
    'service_area_id', v_area.id,
    'distance_km', v_dist,
    'base_fare', v_base,
    'distance_fare', v_dist_fare,
    'care_fee', v_care_fee,
    'per_km_rate', v_per_km,
    'total_fare', v_total,
    'vehicle_type', p_vehicle
  );
END $$;

-- Create Order (with Day 2 Priority Support)
-- Create Order (with Day 2 Priority Support and optional parcel description)
CREATE OR REPLACE FUNCTION public.create_order(
  p_pickup_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_recipient_name text,
  p_recipient_phone text,
  p_parcel_description text DEFAULT 'Standard Delivery Package',
  p_vehicle public.vehicle_type DEFAULT 'BIKE',
  p_care boolean DEFAULT false,
  p_priority public.order_priority DEFAULT 'NORMAL'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  q jsonb;
  new_id uuid;
  v_priority public.order_priority;
  v_desc text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in to book' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_active) THEN
    RAISE EXCEPTION 'Your account is not active' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(p_pickup_address, ''))) < 3 OR length(trim(coalesce(p_dropoff_address, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter both pickup and drop-off addresses' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_recipient_name, ''))) < 2 THEN RAISE EXCEPTION 'Enter the recipient name' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_recipient_phone, '') !~ '^\+?[0-9 \-]{10,16}$' THEN RAISE EXCEPTION 'Enter a valid recipient phone' USING ERRCODE = '22023'; END IF;
  IF p_pickup_lat = p_dropoff_lat AND p_pickup_lng = p_dropoff_lng THEN RAISE EXCEPTION 'Pickup and drop-off cannot be the same point' USING ERRCODE = '22023'; END IF;

  v_desc := COALESCE(NULLIF(trim(coalesce(p_parcel_description, '')), ''), 'Standard Delivery Package');
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
    trim(p_recipient_name), trim(p_recipient_phone), v_desc,
    p_vehicle, coalesce(p_care, false),
    (q->>'distance_km')::numeric, (q->>'base_fare')::numeric, (q->>'distance_fare')::numeric, (q->>'care_fee')::numeric, (q->>'total_fare')::numeric,
    'PENDING', v_priority
  )
  RETURNING id INTO new_id;

  INSERT INTO public.order_status_events (order_id, status, note, created_by)
  VALUES (new_id, 'PENDING', format('Order placed with %s priority — searching nearby riders', v_priority), uid);

  RETURN new_id;
END $$;

-- 11-argument overload for backwards compatibility with earlier clients
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
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.create_order(
    p_pickup_address, p_pickup_lat, p_pickup_lng,
    p_dropoff_address, p_dropoff_lat, p_dropoff_lng,
    p_recipient_name, p_recipient_phone, p_parcel_description,
    p_vehicle, p_care, 'NORMAL'::public.order_priority
  );
$$;

REVOKE EXECUTE ON FUNCTION public.create_order(text, double precision, double precision, text, double precision, double precision, text, text, text, public.vehicle_type, boolean, public.order_priority) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_order(text, double precision, double precision, text, double precision, double precision, text, text, text, public.vehicle_type, boolean, public.order_priority) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_order(text, double precision, double precision, text, double precision, double precision, text, text, text, public.vehicle_type, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_order(text, double precision, double precision, text, double precision, double precision, text, text, text, public.vehicle_type, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_order TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. RIDER DISCOVERY & WORKFLOW FUNCTIONS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.require_active_rider()
RETURNS public.rider_profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_role(auth.uid(), 'rider') THEN RAISE EXCEPTION 'Rider account required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.rider_profiles WHERE user_id = auth.uid();
  IF r IS NULL OR NOT r.is_active THEN RAISE EXCEPTION 'Your rider account is not active' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN RAISE EXCEPTION 'Your account is not active' USING ERRCODE = '42501'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.register_rider(p_vehicle public.vehicle_type)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in' USING ERRCODE = '28000'; END IF;
  IF p_vehicle IS NULL THEN RAISE EXCEPTION 'Choose a vehicle' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.rider_profiles (user_id, vehicle_type, is_active)
  VALUES (uid, p_vehicle, true)
  ON CONFLICT (user_id) DO UPDATE SET vehicle_type = EXCLUDED.vehicle_type, is_active = true;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'rider') ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.set_rider_plate(p_plate text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.rider_profiles SET plate_number = trim(p_plate) WHERE user_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.update_rider_location(p_lat double precision, p_lng double precision, p_is_demo boolean)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles; t timestamptz := now();
BEGIN
  r := public.require_active_rider();
  IF p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE = '22023'; END IF;
  UPDATE public.rider_profiles SET current_lat = p_lat, current_lng = p_lng, location_is_demo = coalesce(p_is_demo, false), location_updated_at = t WHERE user_id = r.user_id;
  RETURN t;
END $$;

-- Smart Nearby Pickup: Distance Calculation & Decision Ranking
CREATE OR REPLACE FUNCTION public.get_available_orders(
  p_radius_km numeric DEFAULT 5,
  p_priority public.order_priority DEFAULT NULL,
  p_sort text DEFAULT 'nearest'
)
RETURNS TABLE (
  id uuid,
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  vehicle_type public.vehicle_type,
  priority public.order_priority,
  pickup_distance_km numeric,
  parcel_summary text,
  handle_with_care boolean,
  status public.order_status,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles;
BEGIN
  r := public.require_active_rider();
  IF r.current_lat IS NULL OR r.current_lng IS NULL THEN RAISE EXCEPTION 'Set your location to see nearby orders' USING ERRCODE = '22023'; END IF;
  IF p_radius_km IS NULL OR p_radius_km <= 0 OR p_radius_km > 50 THEN RAISE EXCEPTION 'Radius must be between 0 and 50 km' USING ERRCODE = '22023'; END IF;

  RETURN QUERY
  WITH c AS (
    SELECT o.*, round(public.haversine_km(r.current_lat, r.current_lng, o.pickup_lat, o.pickup_lng)::numeric, 2) AS d
    FROM public.orders o
    WHERE o.status = 'PENDING' AND o.rider_id IS NULL AND o.vehicle_type = r.vehicle_type
  )
  SELECT c.id, c.pickup_address, c.pickup_lat, c.pickup_lng, c.vehicle_type, c.priority, c.d,
    left(c.parcel_description, 80), c.handle_with_care, c.status, c.created_at
  FROM c
  WHERE c.d <= p_radius_km AND (p_priority IS NULL OR c.priority = p_priority)
  ORDER BY
    CASE WHEN p_sort = 'priority' THEN CASE c.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END ELSE 0 END,
    c.d, c.created_at;
END $$;

-- Atomic Order Acceptance (FOR UPDATE row lock)
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles; o public.orders;
BEGIN
  r := public.require_active_rider();
  PERFORM pg_advisory_xact_lock(hashtext('rider:' || r.user_id::text));
  IF EXISTS (SELECT 1 FROM public.orders WHERE rider_id = r.user_id AND status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')) THEN
    RAISE EXCEPTION 'Finish your current delivery before accepting another' USING ERRCODE = '22023'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'PENDING' OR o.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'This order is no longer available' USING ERRCODE = '22023'; END IF;
  IF o.vehicle_type <> r.vehicle_type THEN RAISE EXCEPTION 'This order needs a % rider', o.vehicle_type USING ERRCODE = '42501'; END IF;

  UPDATE public.orders SET rider_id = r.user_id, status = 'ACCEPTED', accepted_at = now(), updated_at = now()
  WHERE id = o.id AND status = 'PENDING' AND rider_id IS NULL;

  INSERT INTO public.order_status_events (order_id, status, note, created_by)
  VALUES (o.id, 'ACCEPTED', 'Rider accepted the delivery — heading to pickup', r.user_id);

  RETURN o.id;
END $$;

-- Order Lifecycle Progression (Picked Up -> In Transit -> Delivered)
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_status public.order_status)
RETURNS public.order_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles; o public.orders; nxt public.order_status; msg text;
BEGIN
  r := public.require_active_rider();
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.rider_id IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'You are not assigned to this order' USING ERRCODE = '42501'; END IF;

  nxt := CASE o.status
    WHEN 'ACCEPTED' THEN 'PICKED_UP'::public.order_status
    WHEN 'PICKED_UP' THEN 'IN_TRANSIT'::public.order_status
    WHEN 'IN_TRANSIT' THEN 'DELIVERED'::public.order_status
    ELSE NULL END;

  IF nxt IS NULL THEN RAISE EXCEPTION 'This order can no longer be updated' USING ERRCODE = '22023'; END IF;
  IF p_status IS DISTINCT FROM nxt THEN RAISE EXCEPTION 'Invalid status change: next step is %', nxt USING ERRCODE = '22023'; END IF;

  msg := CASE nxt WHEN 'PICKED_UP' THEN 'Parcel picked up' WHEN 'IN_TRANSIT' THEN 'On the way to drop-off' ELSE 'Parcel delivered successfully' END;

  UPDATE public.orders SET status = nxt, updated_at = now(),
    picked_up_at = CASE WHEN nxt = 'PICKED_UP' THEN now() ELSE picked_up_at END,
    in_transit_at = CASE WHEN nxt = 'IN_TRANSIT' THEN now() ELSE in_transit_at END,
    delivered_at = CASE WHEN nxt = 'DELIVERED' THEN now() ELSE delivered_at END
  WHERE id = o.id;

  INSERT INTO public.order_status_events (order_id, status, note, created_by) VALUES (o.id, nxt, msg, r.user_id);
  RETURN nxt;
END $$;

-- Contact details & credentials
CREATE OR REPLACE FUNCTION public.get_order_rider(p_order_id uuid)
RETURNS TABLE (rider_id uuid, full_name text, phone text, vehicle_type public.vehicle_type, plate_number text)
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
  WHERE o.id = p_order_id AND o.rider_id IS NOT NULL
    AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
$$;

CREATE OR REPLACE FUNCTION public.get_order_customer(p_order_id uuid)
RETURNS TABLE (customer_id uuid, full_name text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.customer_id,
    COALESCE(NULLIF(trim(p.full_name), ''), 'Customer') AS full_name,
    COALESCE(NULLIF(trim(p.phone), ''), o.recipient_phone, '+92 300 0000000') AS phone
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.customer_id
  WHERE o.id = p_order_id
    AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
$$;

REVOKE EXECUTE ON FUNCTION public.register_rider, public.require_active_rider, public.update_rider_location, public.get_available_orders, public.accept_order, public.update_order_status, public.get_order_rider, public.get_order_customer, public.set_rider_plate FROM anon, public;
GRANT EXECUTE ON FUNCTION public.register_rider, public.require_active_rider, public.update_rider_location, public.get_available_orders, public.accept_order, public.update_order_status, public.get_order_rider, public.get_order_customer, public.set_rider_plate TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ADMIN ANALYTICS & ESCALATION FUNCTIONS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Your account is not active' USING ERRCODE = '42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_order_priority(p_order_id uuid, p_priority public.order_priority)
RETURNS public.order_priority LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = '22023'; END IF;
  IF o.status IN ('DELIVERED', 'CANCELLED') THEN RAISE EXCEPTION 'Priority can only be changed on open orders' USING ERRCODE = '22023'; END IF;
  UPDATE public.orders SET priority = p_priority, updated_at = now() WHERE id = o.id;
  RETURN p_priority;
END $$;

-- Admin Live Stats (Day 2 Live Priority Counts)
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'total_orders', (SELECT count(*) FROM public.orders),
    'orders_today', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day', now())),
    'pending', (SELECT count(*) FROM public.orders WHERE status = 'PENDING'),
    'active', (SELECT count(*) FROM public.orders WHERE status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')),
    'delivered', (SELECT count(*) FROM public.orders WHERE status = 'DELIVERED'),
    'cancelled', (SELECT count(*) FROM public.orders WHERE status = 'CANCELLED'),
    'total_customers', (SELECT count(*) FROM public.user_roles WHERE role = 'customer'),
    'total_riders', (SELECT count(*) FROM public.rider_profiles),
    'active_riders', (SELECT count(*) FROM public.rider_profiles rp JOIN public.profiles p ON p.id = rp.user_id WHERE rp.is_active AND p.is_active),
    'open_normal', (SELECT count(*) FROM public.orders WHERE priority = 'NORMAL' AND status NOT IN ('DELIVERED', 'CANCELLED')),
    'open_high', (SELECT count(*) FROM public.orders WHERE priority = 'HIGH' AND status NOT IN ('DELIVERED', 'CANCELLED')),
    'open_urgent', (SELECT count(*) FROM public.orders WHERE priority = 'URGENT' AND status NOT IN ('DELIVERED', 'CANCELLED')),
    'all_normal', (SELECT count(*) FROM public.orders WHERE priority = 'NORMAL'),
    'all_high', (SELECT count(*) FROM public.orders WHERE priority = 'HIGH'),
    'all_urgent', (SELECT count(*) FROM public.orders WHERE priority = 'URGENT'),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d::date, 'orders', (SELECT count(*) FROM public.orders WHERE created_at::date = d::date)) ORDER BY d), '[]'::jsonb)
              FROM generate_series(current_date - 13, current_date, interval '1 day') d)
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_orders()
RETURNS TABLE (id uuid, created_at timestamptz, updated_at timestamptz, status public.order_status, priority public.order_priority,
  vehicle_type public.vehicle_type, total_fare numeric, pickup_address text, dropoff_address text,
  customer_id uuid, customer_name text, rider_id uuid, rider_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT o.id, o.created_at, o.updated_at, o.status, o.priority, o.vehicle_type, o.total_fare, o.pickup_address, o.dropoff_address,
    o.customer_id, COALESCE(NULLIF(c.full_name, ''), 'Customer'), o.rider_id, NULLIF(r.full_name, '')
  FROM public.orders o LEFT JOIN public.profiles c ON c.id = o.customer_id LEFT JOIN public.profiles r ON r.id = o.rider_id
  ORDER BY o.created_at DESC LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_riders()
RETURNS TABLE (user_id uuid, full_name text, vehicle_type public.vehicle_type, plate_number text, rider_active boolean,
  account_active boolean, location_updated_at timestamptz, active_order_id uuid, active_order_status public.order_status, delivered_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT rp.user_id, COALESCE(NULLIF(p.full_name, ''), 'Rider'), rp.vehicle_type, rp.plate_number, rp.is_active,
    COALESCE(p.is_active, false), rp.location_updated_at, a.id, a.status,
    (SELECT count(*) FROM public.orders d WHERE d.rider_id = rp.user_id AND d.status = 'DELIVERED')
  FROM public.rider_profiles rp LEFT JOIN public.profiles p ON p.id = rp.user_id
  LEFT JOIN LATERAL (SELECT x.id, x.status FROM public.orders x WHERE x.rider_id = rp.user_id AND x.status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT') LIMIT 1) a ON true
  ORDER BY rp.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_customers()
RETURNS TABLE (user_id uuid, full_name text, phone text, account_active boolean, order_count bigint, last_order_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT p.id, COALESCE(NULLIF(p.full_name, ''), 'Customer'), p.phone, p.is_active,
    (SELECT count(*) FROM public.orders o WHERE o.customer_id = p.id), (SELECT max(o.created_at) FROM public.orders o WHERE o.customer_id = p.id)
  FROM public.profiles p WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'customer')
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('admin', 'rider'))
  ORDER BY p.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_account_active(p_user_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot disable your own account' USING ERRCODE = '22023'; END IF;
  IF public.has_role(p_user_id, 'admin') THEN RAISE EXCEPTION 'Admin accounts cannot be disabled here' USING ERRCODE = '42501'; END IF;
  UPDATE public.profiles SET is_active = p_active WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE = '22023'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.require_admin, public.update_order_priority, public.admin_stats, public.admin_list_orders, public.admin_list_riders, public.admin_list_customers, public.admin_set_account_active FROM anon, public;
GRANT EXECUTE ON FUNCTION public.require_admin, public.update_order_priority, public.admin_stats, public.admin_list_orders, public.admin_list_riders, public.admin_list_customers, public.admin_set_account_active TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. AUTH TRIGGER: Automatic Profile & Role Creation on Signup
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_role_txt text;
  v_phone text;
  v_vehicle public.vehicle_type;
  v_vehicle_txt text;
  v_plate text;
BEGIN
  v_phone := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');

  INSERT INTO public.profiles (id, full_name, phone, is_active)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), ''), split_part(COALESCE(NEW.email, 'User'), '@', 1)),
    v_phone,
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  v_role_txt := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', 'customer')));

  -- If email starts with admin@, or explicitly tmms/logipulse admin -> grant admin role
  IF lower(COALESCE(NEW.email, '')) LIKE 'admin@%'
     OR lower(COALESCE(NEW.email, '')) IN ('admin@tmms.pk', 'admin@logipulse.com', 'admin@logipulse.pk') THEN
    v_role := 'admin'::public.app_role;
  ELSIF v_role_txt = 'rider' THEN
    v_role := 'rider'::public.app_role;
  ELSE
    v_role := 'customer'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_role = 'rider' THEN
    v_vehicle_txt := upper(trim(COALESCE(NEW.raw_user_meta_data->>'vehicle_type', 'BIKE')));
    v_vehicle := CASE WHEN v_vehicle_txt = 'CARGO' THEN 'CARGO'::public.vehicle_type ELSE 'BIKE'::public.vehicle_type END;
    v_plate := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'plate_number', '')), '');

    INSERT INTO public.rider_profiles (user_id, vehicle_type, plate_number, is_active)
    VALUES (NEW.id, v_vehicle, v_plate, true)
    ON CONFLICT (user_id) DO UPDATE
      SET vehicle_type = EXCLUDED.vehicle_type,
          plate_number = COALESCE(EXCLUDED.plate_number, public.rider_profiles.plate_number);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 7. DEFAULT SERVICE AREA & PRICING RULES (Karachi)
-- ----------------------------------------------------------------------------

INSERT INTO public.service_areas (name, center_lat, center_lng, radius_km, is_active)
SELECT 'Karachi', 24.8607, 67.0011, 30.0, true
WHERE NOT EXISTS (SELECT 1 FROM public.service_areas WHERE name = 'Karachi');

INSERT INTO public.pricing_rules (vehicle_type, base_fare, per_km_rate, care_fee, is_active)
VALUES
  ('BIKE', 150.00, 35.00, 50.00, true),
  ('CARGO', 350.00, 65.00, 100.00, true)
ON CONFLICT (vehicle_type) DO UPDATE
  SET base_fare = EXCLUDED.base_fare,
      per_km_rate = EXCLUDED.per_km_rate,
      care_fee = EXCLUDED.care_fee;

-- ----------------------------------------------------------------------------
-- 8. SEED ADMIN ACCOUNTS (Pre-confirmed with instant login)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._seed_admin_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_pw text;
BEGIN
  -- Hash password with standard bcrypt
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(p_email),
      v_encrypted_pw,
      now(), -- Pre-confirmed, bypasses email verification
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'role', 'admin', 'phone', p_phone),
      now(),
      now(),
      ''
    );
  ELSE
    -- If user exists, reset password to desired password and confirm email
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'role', 'admin', 'phone', p_phone)
    WHERE id = v_user_id;
  END IF;

  -- Ensure active profile
  INSERT INTO public.profiles (id, full_name, phone, is_active)
  VALUES (v_user_id, p_full_name, p_phone, true)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, is_active = true;

  -- Ensure auth identity exists so GoTrue password login succeeds
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', lower(p_email)),
    'email', lower(p_email), now(), now(), now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
    SET identity_data = EXCLUDED.identity_data, updated_at = now();

  -- Ensure admin role is granted
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Admin provisioned: % (Password: %)', p_email, p_password;
END $$;

-- Seed verified admin credentials:
-- Primary: admin@logipulse.com / Admin@LogiPulse2026!
SELECT public._seed_admin_account('admin@logipulse.com', 'Admin@LogiPulse2026!', 'LogiPulse Lead Admin', '+92 300 0000000');

-- Secondary: admin@tmms.com / Admin123!
SELECT public._seed_admin_account('admin@tmms.com', 'Admin123!', 'TMMS Dispatch Admin', '+92 300 1234567');

-- Also automatically promote the logged-in owner account (m.ahmedraza1527@gmail.com) to admin:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) IN ('m.ahmedraza1527@gmail.com', 'ahmed.studies15@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. REALTIME PUBLICATION REPLICATION
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['orders', 'order_status_events', 'messages', 'rider_profiles'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ============================================================================
-- SETUP COMPLETE!
-- Admin Accounts Ready:
--   1. Email: admin@logipulse.com   Password: Admin@LogiPulse2026!
--   2. Email: admin@tmms.com        Password: Admin123!
--   3. Personal account (m.ahmedraza1527@gmail.com) is also granted Admin!
-- ============================================================================
