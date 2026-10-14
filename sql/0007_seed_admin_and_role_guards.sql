-- ============================================================================
-- LogiPulse Phase 8: Admin Seeding, Strict RBAC & Role Enforcement
-- Run in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query -> Run)
-- ============================================================================

-- 1. Helper function: Get authenticated caller's primary role
CREATE OR REPLACE FUNCTION public.get_my_primary_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'anon';
  END IF;

  -- Admin takes highest precedence
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RETURN 'admin';
  END IF;

  -- Rider takes second precedence
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'rider')
     OR EXISTS (SELECT 1 FROM public.rider_profiles WHERE user_id = auth.uid()) THEN
    RETURN 'rider';
  END IF;

  -- Default to customer
  RETURN 'customer';
END $$;

REVOKE EXECUTE ON FUNCTION public.get_my_primary_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_primary_role() TO authenticated;

-- 2. Seed Default Admin User: admin@logipulse.com / Admin@LogiPulse2026!
-- Using pgcrypto to safely seed the credentials into auth.users without public registration
DO $$
DECLARE
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_encrypted_pw text;
BEGIN
  -- Generate bcrypt hash for 'Admin@LogiPulse2026!'
  v_encrypted_pw := crypt('Admin@LogiPulse2026!', gen_salt('bf'));

  -- Check if admin already exists by email or fixed ID
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@logipulse.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'admin@logipulse.com',
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"LogiPulse Dispatch Admin","role":"admin"}'::jsonb,
      now(),
      now(),
      ''
    );
  ELSE
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@logipulse.com';
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_admin_id;
  END IF;

  -- Ensure profile exists and is active
  INSERT INTO public.profiles (id, full_name, phone, is_active)
  VALUES (v_admin_id, 'LogiPulse Dispatch Admin', '+92 300 0000000', true)
  ON CONFLICT (id) DO UPDATE
    SET full_name = 'LogiPulse Dispatch Admin',
        is_active = true;

  -- Ensure admin role is granted
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Admin user provisioned: admin@logipulse.com';
END $$;

-- 3. Convenience Snippet: Promote the owner's existing account to Admin
-- If you signed up with ahmed.studies15@gmail.com, this assigns the admin role:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'ahmed.studies15@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Also ensure active profile for the promoted account
UPDATE public.profiles
SET is_active = true
WHERE id IN (SELECT id FROM auth.users WHERE email = 'ahmed.studies15@gmail.com');

-- 4. Re-enforce strict handle_new_user() trigger:
-- Disallows any self-assignment of 'admin' role from client auth.signUp metadata
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
  -- STRICT RBAC: Only 'rider' or 'customer' can be selected on public signup. Never 'admin'.
  IF v_role_txt = 'rider' THEN
    v_role := 'rider'::public.app_role;
  ELSE
    v_role := 'customer'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- If rider, create rider profile
  IF v_role = 'rider' THEN
    v_vehicle_txt := upper(trim(COALESCE(NEW.raw_user_meta_data->>'vehicle_type', 'BIKE')));
    IF v_vehicle_txt = 'CARGO' THEN
      v_vehicle := 'CARGO'::public.vehicle_type;
    ELSE
      v_vehicle := 'BIKE'::public.vehicle_type;
    END IF;

    v_plate := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'plate_number', '')), '');

    INSERT INTO public.rider_profiles (user_id, vehicle_type, plate_number, is_active)
    VALUES (NEW.id, v_vehicle, v_plate, true)
    ON CONFLICT (user_id) DO UPDATE
      SET vehicle_type = EXCLUDED.vehicle_type,
          plate_number = COALESCE(EXCLUDED.plate_number, public.rider_profiles.plate_number);
  END IF;

  RETURN NEW;
END $$;
