-- LogiPulse Phase 6: admin console + priority management. Run AFTER 0004. Safe to re-run.
-- Roles: user_roles only grants SELECT to signed-in users, so nobody can make themselves admin.
-- To create an admin, run once (replace the email):
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Your account is not active' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_order_priority(p_order_id uuid, p_priority public.order_priority)
RETURNS public.order_priority LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='22023'; END IF;
  IF o.status IN ('DELIVERED','CANCELLED') THEN RAISE EXCEPTION 'Priority can only be changed on open orders' USING ERRCODE='22023'; END IF;
  UPDATE public.orders SET priority = p_priority, updated_at = now() WHERE id = o.id;
  RETURN p_priority;
END $$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'total_orders', (SELECT count(*) FROM public.orders),
    'orders_today', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day', now())),
    'pending', (SELECT count(*) FROM public.orders WHERE status = 'PENDING'),
    'active', (SELECT count(*) FROM public.orders WHERE status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT')),
    'delivered', (SELECT count(*) FROM public.orders WHERE status = 'DELIVERED'),
    'cancelled', (SELECT count(*) FROM public.orders WHERE status = 'CANCELLED'),
    'total_customers', (SELECT count(*) FROM public.user_roles WHERE role = 'customer'),
    'total_riders', (SELECT count(*) FROM public.rider_profiles),
    'active_riders', (SELECT count(*) FROM public.rider_profiles rp JOIN public.profiles p ON p.id = rp.user_id WHERE rp.is_active AND p.is_active),
    'open_normal', (SELECT count(*) FROM public.orders WHERE priority='NORMAL' AND status NOT IN ('DELIVERED','CANCELLED')),
    'open_high', (SELECT count(*) FROM public.orders WHERE priority='HIGH' AND status NOT IN ('DELIVERED','CANCELLED')),
    'open_urgent', (SELECT count(*) FROM public.orders WHERE priority='URGENT' AND status NOT IN ('DELIVERED','CANCELLED')),
    'all_normal', (SELECT count(*) FROM public.orders WHERE priority='NORMAL'),
    'all_high', (SELECT count(*) FROM public.orders WHERE priority='HIGH'),
    'all_urgent', (SELECT count(*) FROM public.orders WHERE priority='URGENT'),
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
    o.customer_id, COALESCE(NULLIF(c.full_name,''),'Customer'), o.rider_id, NULLIF(r.full_name,'')
  FROM public.orders o LEFT JOIN public.profiles c ON c.id = o.customer_id LEFT JOIN public.profiles r ON r.id = o.rider_id
  ORDER BY o.created_at DESC LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_riders()
RETURNS TABLE (user_id uuid, full_name text, vehicle_type public.vehicle_type, plate_number text, rider_active boolean,
  account_active boolean, location_updated_at timestamptz, active_order_id uuid, active_order_status public.order_status, delivered_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT rp.user_id, COALESCE(NULLIF(p.full_name,''),'Rider'), rp.vehicle_type, rp.plate_number, rp.is_active,
    COALESCE(p.is_active, false), rp.location_updated_at, a.id, a.status,
    (SELECT count(*) FROM public.orders d WHERE d.rider_id = rp.user_id AND d.status = 'DELIVERED')
  FROM public.rider_profiles rp LEFT JOIN public.profiles p ON p.id = rp.user_id
  LEFT JOIN LATERAL (SELECT x.id, x.status FROM public.orders x WHERE x.rider_id = rp.user_id AND x.status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT') LIMIT 1) a ON true
  ORDER BY rp.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_customers()
RETURNS TABLE (user_id uuid, full_name text, phone text, account_active boolean, order_count bigint, last_order_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY SELECT p.id, COALESCE(NULLIF(p.full_name,''),'Customer'), p.phone, p.is_active,
    (SELECT count(*) FROM public.orders o WHERE o.customer_id = p.id), (SELECT max(o.created_at) FROM public.orders o WHERE o.customer_id = p.id)
  FROM public.profiles p WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'customer')
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('admin','rider'))
  ORDER BY p.created_at DESC;
END $$;

-- Enable/disable an account. Disabled accounts are blocked by require_active_rider, create_order and chat.
CREATE OR REPLACE FUNCTION public.admin_set_account_active(p_user_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot disable your own account' USING ERRCODE='22023'; END IF;
  IF public.has_role(p_user_id,'admin') THEN RAISE EXCEPTION 'Admin accounts cannot be disabled here' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET is_active = p_active WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE='22023'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.require_admin(), public.update_order_priority(uuid, public.order_priority), public.admin_stats(), public.admin_list_orders(), public.admin_list_riders(), public.admin_list_customers(), public.admin_set_account_active(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.require_admin(), public.update_order_priority(uuid, public.order_priority), public.admin_stats(), public.admin_list_orders(), public.admin_list_riders(), public.admin_list_customers(), public.admin_set_account_active(uuid, boolean) TO authenticated;

-- Disabled accounts can't send chat messages.
DROP POLICY IF EXISTS "participants send during active delivery" ON public.messages;
CREATE POLICY "participants send during active delivery" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND o.rider_id IS NOT NULL AND o.status IN ('ACCEPTED','PICKED_UP','IN_TRANSIT')
      AND (o.customer_id = auth.uid() OR o.rider_id = auth.uid())));

-- Users must never edit their own is_active flag (profile self-update policy existed before).
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;
