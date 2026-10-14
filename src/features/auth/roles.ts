import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "rider" | "customer";

export interface UserRoleState {
  isAdmin: boolean;
  isRider: boolean;
  isCustomer: boolean;
  primaryRole: AppRole;
}

/**
 * Resolves the primary role and role capabilities for a user.
 * Priority: admin > rider > customer
 */
export async function getUserRoleState(userId?: string): Promise<UserRoleState> {
  let uid = userId;
  if (!uid) {
    const { data: u } = await supabase.auth.getUser();
    uid = u.user?.id;
  }

  if (!uid) {
    return {
      isAdmin: false,
      isRider: false,
      isCustomer: true,
      primaryRole: "customer",
    };
  }

  try {
    // 1. Fetch user roles from user_roles
    const { data: roleRecords } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);

    const roles = (roleRecords ?? []).map((r) => r.role as string);

    // 2. Also check rider_profiles as a fallback confirmation
    let hasRiderProfile = false;
    if (!roles.includes("rider")) {
      const { data: rp } = await supabase
        .from("rider_profiles")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (rp) hasRiderProfile = true;
    }

    const isAdmin = roles.includes("admin");
    const isRider = roles.includes("rider") || hasRiderProfile;
    const isCustomer = roles.includes("customer") || (!isAdmin && !isRider);

    const primaryRole: AppRole = isAdmin ? "admin" : isRider ? "rider" : "customer";

    return {
      isAdmin,
      isRider,
      isCustomer,
      primaryRole,
    };
  } catch (err) {
    console.error("Failed to resolve user roles:", err);
    return {
      isAdmin: false,
      isRider: false,
      isCustomer: true,
      primaryRole: "customer",
    };
  }
}

/**
 * Returns true if the user is authorized as a rider.
 */
export async function isUserRider(userId?: string): Promise<boolean> {
  const state = await getUserRoleState(userId);
  return state.isRider;
}

/**
 * Returns true if the user is authorized as an admin.
 */
export async function isUserAdmin(userId?: string): Promise<boolean> {
  const state = await getUserRoleState(userId);
  return state.isAdmin;
}
