CREATE TABLE public.rider_profiles (
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