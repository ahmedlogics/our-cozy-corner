-- ============================================================================
-- LogiPulse — Seed Realistic Customer Accounts & Fix Admin Customers View
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. UPDATE admin_list_customers()
-- Ensures that:
--   - All accounts with the 'customer' role are returned
--   - Any user who placed delivery orders (including test orders) is returned
--   - Regular users who are not riders and not admins are returned
--   - Accurately counts real orders and computes last order timestamp
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
    -- OR general profile (not admin and not rider)
    OR (
      NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
      AND NOT EXISTS (SELECT 1 FROM public.rider_profiles rp WHERE rp.user_id = p.id)
    )
  )
  ORDER BY 
    (SELECT count(*) FROM public.orders o WHERE o.customer_id = p.id) DESC,
    p.created_at DESC;
END $$;

-- 2. UPDATE admin_stats()
-- Accurately counts distinct customers including users who have placed orders
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
      SELECT count(DISTINCT p.id) FROM public.profiles p
      WHERE (
        EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'customer')
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_id = p.id)
        OR (
          NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
          AND NOT EXISTS (SELECT 1 FROM public.rider_profiles rp WHERE rp.user_id = p.id)
        )
      )
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

REVOKE EXECUTE ON FUNCTION public.admin_list_customers, public.admin_stats FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_customers, public.admin_stats TO authenticated;

-- 3. HELPER FUNCTION TO SEED DEMO CUSTOMERS
CREATE OR REPLACE FUNCTION public._seed_demo_customer(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_pw text;
BEGIN
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
      now(), -- Pre-confirmed, ready for immediate sign-in
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'role', 'customer', 'phone', p_phone),
      now(),
      now(),
      ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'role', 'customer', 'phone', p_phone)
    WHERE id = v_user_id;
  END IF;

  -- Ensure active profile
  INSERT INTO public.profiles (id, full_name, phone, is_active)
  VALUES (v_user_id, p_full_name, p_phone, true)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, is_active = true;

  -- Ensure auth identity exists for GoTrue password login
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', lower(p_email)),
    'email', lower(p_email), now(), now(), now()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
    SET identity_data = EXCLUDED.identity_data, updated_at = now();

  -- Grant customer role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'customer'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_user_id;
END $$;

-- 4. SEED THREE REALISTIC CUSTOMER ACCOUNTS
DO $$
DECLARE
  v_cust1 uuid;
  v_cust2 uuid;
  v_cust3 uuid;
  v_area_id uuid;
  v_rider_id uuid;
BEGIN
  -- Obtain a valid service area
  SELECT id INTO v_area_id FROM public.service_areas LIMIT 1;
  -- Obtain an active rider
  SELECT user_id INTO v_rider_id FROM public.rider_profiles WHERE is_active LIMIT 1;

  -- Seed Customer 1: Sarah Ahmed (Clifton)
  v_cust1 := public._seed_demo_customer('sarah.customer@logipulse.com', 'Customer123!', 'Sarah Ahmed', '+92 321 9876543');
  -- Seed Customer 2: Bilal Siddiqui (Gulshan)
  v_cust2 := public._seed_demo_customer('bilal.customer@logipulse.com', 'Customer123!', 'Bilal Siddiqui', '+92 333 4567890');
  -- Seed Customer 3: Zainab Fatima (DHA)
  v_cust3 := public._seed_demo_customer('zainab.customer@logipulse.com', 'Customer123!', 'Zainab Fatima', '+92 300 8765432');

  -- Seed Orders for Customer 1 (Sarah Ahmed) if none exist
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE customer_id = v_cust1) THEN
    INSERT INTO public.orders (
      id, customer_id, rider_id, service_area_id,
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      recipient_name, recipient_phone, parcel_description,
      vehicle_type, handle_with_care, distance_km,
      base_fare, distance_fare, care_fee, total_fare,
      status, priority, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_cust1, v_rider_id, v_area_id,
      'Ocean Mall, Clifton Block 9, Karachi', 24.8155, 67.0315,
      'Saddar Electronic Market, Abdullah Haroon Rd, Karachi', 24.8580, 67.0190,
      'Tariq Siddiqui', '+92 301 2345678', 'Mobile Accessories [Weight: 1.2 kg]',
      'BIKE', false, 5.2,
      120.00, 130.00, 0.00, 250.00,
      'DELIVERED', 'NORMAL', now() - interval '2 days', now() - interval '2 days' + interval '40 mins'
    );
  END IF;

  -- Seed Orders for Customer 2 (Bilal Siddiqui) if none exist
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE customer_id = v_cust2) THEN
    INSERT INTO public.orders (
      id, customer_id, rider_id, service_area_id,
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      recipient_name, recipient_phone, parcel_description,
      vehicle_type, handle_with_care, distance_km,
      base_fare, distance_fare, care_fee, total_fare,
      status, priority, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_cust2, v_rider_id, v_area_id,
      'Disco Bakery, Gulshan-e-Iqbal Block 5, Karachi', 24.9288, 67.0984,
      'Millennium Mall, Gulistan-e-Johar, Karachi', 24.8980, 67.1245,
      'Hamza Farooq', '+92 313 5557788', 'Gift Package & Bakery Items [Weight: 2.0 kg]',
      'CARGO', true, 4.8,
      250.00, 192.00, 80.00, 522.00,
      'DELIVERED', 'HIGH', now() - interval '1 day', now() - interval '1 day' + interval '35 mins'
    );
  END IF;

  -- Seed Orders for Customer 3 (Zainab Fatima) if none exist
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE customer_id = v_cust3) THEN
    INSERT INTO public.orders (
      id, customer_id, rider_id, service_area_id,
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      recipient_name, recipient_phone, parcel_description,
      vehicle_type, handle_with_care, distance_km,
      base_fare, distance_fare, care_fee, total_fare,
      status, priority, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_cust3, NULL, v_area_id,
      'Bukhari Commercial, DHA Phase 6, Karachi', 24.8021, 67.0652,
      'I.I. Chundrigar Road, Financial District, Karachi', 24.8512, 67.0019,
      'Advocate Kamran Malik', '+92 300 9998877', 'Legal Contracts & Seal [Weight: 0.5 kg]',
      'BIKE', true, 8.4,
      120.00, 210.00, 60.00, 390.00,
      'PENDING', 'URGENT', now() - interval '15 mins', now() - interval '15 mins'
    );
  END IF;

  RAISE NOTICE 'Demo customer accounts and Karachi sample orders successfully provisioned.';
END $$;
