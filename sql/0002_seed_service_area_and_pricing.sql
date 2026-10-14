INSERT INTO public.service_areas (name, center_lat, center_lng, radius_km, is_active)
SELECT 'Karachi', 24.8607, 67.0011, 25, true
WHERE NOT EXISTS (SELECT 1 FROM public.service_areas);

INSERT INTO public.pricing_rules (vehicle_type, base_fare, per_km_rate, care_fee, is_active)
SELECT v.vehicle_type, v.base, v.per_km, v.care, true
FROM (VALUES
  ('BIKE'::public.vehicle_type, 100.00, 45.00, 150.00),
  ('CARGO'::public.vehicle_type, 250.00, 90.00, 300.00)
) AS v(vehicle_type, base, per_km, care)
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_rules);