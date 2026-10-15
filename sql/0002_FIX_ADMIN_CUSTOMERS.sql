-- ============================================================================
-- LogiPulse — Fix Customer Accounts Display in Admin Dashboard
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. Update admin_list_customers() to show all customer accounts
-- (any profile that is not an admin and not a rider, or has customer role, or has placed orders)
CREATE OR REPLACE FUNCTION public.admin_list_customers()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  phone text,
  account_active boolean,
  order_count bigint,
  last_order_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY 
  SELECT 
    p.id, 
    COALESCE(NULLIF(p.full_name, ''), split_part(COALESCE(u.email, 'Customer'), '@', 1)), 
    p.phone, 
    p.is_active,
    (SELECT count(*) FROM public.orders o WHERE o.customer_id = p.id), 
    (SELECT max(o.created_at) FROM public.orders o WHERE o.customer_id = p.id)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE (
    -- Explicitly marked as customer in user_roles
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'customer')
    -- OR has placed an order as customer
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_id = p.id)
    -- OR simply not an admin and not a rider
    OR (
      NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
      AND NOT EXISTS (SELECT 1 FROM public.rider_profiles rp WHERE rp.user_id = p.id)
    )
  )
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
  AND NOT EXISTS (SELECT 1 FROM public.rider_profiles rp WHERE rp.user_id = p.id)
  ORDER BY p.created_at DESC;
END $$;

-- 2. Update admin_stats() to count all customers accurately
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
    'total_customers', (
      SELECT count(*) FROM public.profiles p
      WHERE (
        EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'customer')
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_id = p.id)
        OR (
          NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
          AND NOT EXISTS (SELECT 1 FROM public.rider_profiles rp WHERE rp.user_id = p.id)
        )
      )
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
      AND NOT EXISTS (SELECT 1 FROM public.rider_profiles rp WHERE rp.user_id = p.id)
    ),
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

-- 3. Backfill missing customer roles in user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'customer'::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.rider_profiles rp WHERE rp.user_id = p.id)
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Grant permissions
REVOKE EXECUTE ON FUNCTION public.admin_list_customers, public.admin_stats FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_customers, public.admin_stats TO authenticated;

-- Done! Refresh the LogiPulse admin portal at http://localhost:8080/admin/customers
