import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAdmin } from "@/features/admin/admin";

// UI gate only — every admin database call is re-checked by require_admin() in Supabase.
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    if (!(await isAdmin())) throw redirect({ to: "/" });
  },
  component: () => <Outlet />,
});
