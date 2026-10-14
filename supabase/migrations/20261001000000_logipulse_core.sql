CREATE TYPE public.app_role AS ENUM ('admin','customer','rider');
CREATE TYPE public.vehicle_type AS ENUM ('BIKE','CARGO');
CREATE TYPE public.order_status AS ENUM ('PENDING','ACCEPTED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED');
CREATE TYPE public.order_priority AS ENUM ('NORMAL','HIGH','URGENT');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
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

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''),'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.service_areas (
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
CREATE POLICY "areas readable" ON public.service_areas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage areas" ON public.service_areas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pricing_rules (
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
CREATE POLICY "pricing readable" ON public.pricing_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage pricing" ON public.pricing_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.orders (
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
CREATE INDEX orders_customer_idx ON public.orders(customer_id, created_at DESC);
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or assigned orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = rider_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ose_order_idx ON public.order_status_events(order_id, created_at);
GRANT SELECT ON public.order_status_events TO authenticated;
GRANT ALL ON public.order_status_events TO service_role;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
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