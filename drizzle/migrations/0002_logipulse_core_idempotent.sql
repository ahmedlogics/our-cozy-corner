DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'app_role' AND n.nspname = 'public') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','customer','rider');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'vehicle_type' AND n.nspname = 'public') THEN
    CREATE TYPE public.vehicle_type AS ENUM ('BIKE','CARGO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'order_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.order_status AS ENUM ('PENDING','ACCEPTED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'order_priority' AND n.nspname = 'public') THEN
    CREATE TYPE public.order_priority AS ENUM ('NORMAL','HIGH','URGENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "own roles read" ON public.user_roles;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''),'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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
GRANT INSERT, UPDATE, DELETE ON public.service_areas TO authenticated;
GRANT ALL ON public.service_areas TO service_role;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "areas readable" ON public.service_areas;
CREATE POLICY "areas readable" ON public.service_areas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins manage areas" ON public.service_areas;
CREATE POLICY "admins manage areas" ON public.service_areas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

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
GRANT INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing readable" ON public.pricing_rules;
CREATE POLICY "pricing readable" ON public.pricing_rules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins manage pricing" ON public.pricing_rules;
CREATE POLICY "admins manage pricing" ON public.pricing_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

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
  distance_km numeric(10,2) NOT NULL,
  base_fare numeric(10,2) NOT NULL,
  distance_fare numeric(10,2) NOT NULL,
  care_fee numeric(10,2) NOT NULL,
  total_fare numeric(10,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'PENDING',
  priority public.order_priority NOT NULL DEFAULT 'NORMAL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders(customer_id, created_at DESC);
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own or assigned orders" ON public.orders;
CREATE POLICY "read own or assigned orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = rider_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ose_order_idx ON public.order_status_events(order_id, created_at);
GRANT SELECT ON public.order_status_events TO authenticated;
GRANT ALL ON public.order_status_events TO service_role;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read events of visible orders" ON public.order_status_events;
CREATE POLICY "read events of visible orders" ON public.order_status_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 2 * 6371.0088 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

CREATE OR REPLACE FUNCTION public.quote_order(p_pickup_lat double precision, p_pickup_lng double precision, p_dropoff_lat double precision, p_dropoff_lng double precision, p_vehicle public.vehicle_type, p_care boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r record; d numeric; bf numeric; df numeric; cf numeric;
BEGIN
  IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL OR p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL
     OR abs(p_pickup_lat) > 90 OR abs(p_dropoff_lat) > 90 OR abs(p_pickup_lng) > 180 OR abs(p_dropoff_lng) > 180 THEN
    RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE = '22023';
  END IF;
  IF p_vehicle IS NULL THEN RAISE EXCEPTION 'Choose a vehicle type' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM public.service_areas s WHERE s.is_active
    AND public.haversine_km(s.center_lat, s.center_lng, p_pickup_lat, p_pickup_lng) <= s.radius_km
    AND public.haversine_km(s.center_lat, s.center_lng, p_dropoff_lat, p_dropoff_lng) <= s.radius_km
    ORDER BY s.created_at LIMIT 1;
  IF a IS NULL THEN
    RAISE EXCEPTION 'Pickup and drop-off must both be inside the same active service area' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.pricing_rules WHERE vehicle_type = p_vehicle AND is_active;
  IF r IS NULL THEN RAISE EXCEPTION 'No active pricing for this vehicle' USING ERRCODE = '22023'; END IF;
  d := round(public.haversine_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng)::numeric, 2);
  bf := round(r.base_fare, 2);
  df := round(d * r.per_km_rate, 2);
  cf := CASE WHEN p_care THEN round(r.care_fee, 2) ELSE 0 END;
  RETURN jsonb_build_object('service_area_id', a.id, 'service_area_name', a.name, 'distance_km', d,
    'base_fare', bf, 'per_km_rate', r.per_km_rate, 'distance_fare', df, 'care_fee', cf, 'total_fare', bf + df + cf, 'vehicle_type', p_vehicle);
END $$;

CREATE OR REPLACE FUNCTION public.create_order(p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_address text, p_dropoff_lat double precision, p_dropoff_lng double precision,
  p_recipient_name text, p_recipient_phone text, p_parcel_description text, p_vehicle public.vehicle_type, p_care boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); q jsonb; new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in to book' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_active) THEN
    RAISE EXCEPTION 'Your account is not active' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(p_pickup_address,''))) < 3 OR length(trim(coalesce(p_dropoff_address,''))) < 3 THEN
    RAISE EXCEPTION 'Enter both pickup and drop-off addresses' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_recipient_name,''))) < 2 THEN RAISE EXCEPTION 'Enter the recipient name' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_recipient_phone,'') !~ '^\+?[0-9 \-]{10,16}$' THEN RAISE EXCEPTION 'Enter a valid recipient phone' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_parcel_description,''))) < 2 THEN RAISE EXCEPTION 'Describe the parcel' USING ERRCODE = '22023'; END IF;
  IF p_pickup_lat = p_dropoff_lat AND p_pickup_lng = p_dropoff_lng THEN RAISE EXCEPTION 'Pickup and drop-off cannot be the same point' USING ERRCODE = '22023'; END IF;
  q := public.quote_order(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng, p_vehicle, coalesce(p_care,false));
  INSERT INTO public.orders (customer_id, rider_id, service_area_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
    recipient_name, recipient_phone, parcel_description, vehicle_type, handle_with_care, distance_km, base_fare, distance_fare, care_fee, total_fare, status, priority)
  VALUES (uid, NULL, (q->>'service_area_id')::uuid, trim(p_pickup_address), p_pickup_lat, p_pickup_lng, trim(p_dropoff_address), p_dropoff_lat, p_dropoff_lng,
    trim(p_recipient_name), trim(p_recipient_phone), trim(p_parcel_description), p_vehicle, coalesce(p_care,false),
    (q->>'distance_km')::numeric, (q->>'base_fare')::numeric, (q->>'distance_fare')::numeric, (q->>'care_fee')::numeric, (q->>'total_fare')::numeric, 'PENDING', 'NORMAL')
  RETURNING id INTO new_id;
  INSERT INTO public.order_status_events (order_id, status, note, created_by) VALUES (new_id, 'PENDING', 'Order placed — waiting for a rider', uid);
  RETURN new_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_order FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_order TO authenticated;

CREATE TABLE IF NOT EXISTS public.rider_profiles (
  user_id uuid PRIMARY KEY,
  vehicle_type public.vehicle_type NOT NULL,
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
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.register_rider(p_vehicle public.vehicle_type)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in' USING ERRCODE='28000'; END IF;
  IF p_vehicle IS NULL THEN RAISE EXCEPTION 'Choose a vehicle' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.rider_profiles WHERE user_id = uid) THEN RAISE EXCEPTION 'You are already registered as a rider' USING ERRCODE='22023'; END IF;
  INSERT INTO public.rider_profiles (user_id, vehicle_type) VALUES (uid, p_vehicle);
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'rider') ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.require_active_rider()
RETURNS public.rider_profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in' USING ERRCODE='28000'; END IF;
  IF NOT public.has_role(auth.uid(),'rider') THEN RAISE EXCEPTION 'Rider account required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.rider_profiles WHERE user_id = auth.uid();
  IF r IS NULL OR NOT r.is_active THEN RAISE EXCEPTION 'Your rider account is not active' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN RAISE EXCEPTION 'Your account is not active' USING ERRCODE='42501'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.update_rider_location(p_lat double precision, p_lng double precision, p_is_demo boolean)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles; t timestamptz := now();
BEGIN
  r := public.require_active_rider();
  IF p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE='22023'; END IF;
  UPDATE public.rider_profiles SET current_lat = p_lat, current_lng = p_lng, location_is_demo = coalesce(p_is_demo,false), location_updated_at = t WHERE user_id = r.user_id;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.get_available_orders(p_radius_km numeric DEFAULT 5, p_priority public.order_priority DEFAULT NULL, p_sort text DEFAULT 'nearest')
RETURNS TABLE (id uuid, pickup_address text, pickup_lat double precision, pickup_lng double precision, vehicle_type public.vehicle_type,
  priority public.order_priority, pickup_distance_km numeric, parcel_summary text, handle_with_care boolean, status public.order_status, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles;
BEGIN
  r := public.require_active_rider();
  IF r.current_lat IS NULL OR r.current_lng IS NULL THEN RAISE EXCEPTION 'Set your location to see nearby orders' USING ERRCODE='22023'; END IF;
  IF p_radius_km IS NULL OR p_radius_km <= 0 OR p_radius_km > 50 THEN RAISE EXCEPTION 'Radius must be between 0 and 50 km' USING ERRCODE='22023'; END IF;
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

CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rider_profiles; o public.orders;
BEGIN
  r := public.require_active_rider();
  IF EXISTS (SELECT 1 FROM public.orders WHERE rider_id = r.user_id AND status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT')) THEN
    RAISE EXCEPTION 'Finish your current delivery before accepting another' USING ERRCODE='22023'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='22023'; END IF;
  IF o.status <> 'PENDING' OR o.rider_id IS NOT NULL THEN RAISE EXCEPTION 'This order is no longer available' USING ERRCODE='22023'; END IF;
  IF o.vehicle_type <> r.vehicle_type THEN RAISE EXCEPTION 'This order needs a % rider', o.vehicle_type USING ERRCODE='42501'; END IF;
  UPDATE public.orders SET rider_id = r.user_id, status = 'ACCEPTED', updated_at = now() WHERE id = o.id;
  INSERT INTO public.order_status_events (order_id, status, note, created_by) VALUES (o.id, 'ACCEPTED', 'Rider accepted the order', r.user_id);
  RETURN o.id;
END $$;

REVOKE EXECUTE ON FUNCTION public.register_rider, public.require_active_rider, public.update_rider_location, public.get_available_orders, public.accept_order FROM anon, public;
GRANT EXECUTE ON FUNCTION public.register_rider, public.require_active_rider, public.update_rider_location, public.get_available_orders, public.accept_order TO authenticated;