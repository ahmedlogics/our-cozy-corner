-- LogiPulse Phase 7: Role-aware user creation with phone number & rider profile sync.
-- Safe to re-run in Supabase SQL editor.

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
  -- Extract phone
  v_phone := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');

  -- Insert profile
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), ''), split_part(COALESCE(NEW.email, 'User'), '@', 1)),
    v_phone
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  -- Determine role
  v_role_txt := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', 'customer')));
  IF v_role_txt = 'rider' THEN
    v_role := 'rider'::public.app_role;
  ELSIF v_role_txt = 'admin' THEN
    -- Admin role only assignable if explicitly allowed or defaulted to customer for safety
    v_role := 'customer'::public.app_role;
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

    INSERT INTO public.rider_profiles (user_id, vehicle_type, plate_number)
    VALUES (NEW.id, v_vehicle, v_plate)
    ON CONFLICT (user_id) DO UPDATE
      SET vehicle_type = EXCLUDED.vehicle_type,
          plate_number = COALESCE(EXCLUDED.plate_number, public.rider_profiles.plate_number);
  END IF;

  RETURN NEW;
END $$;

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
