import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CurrentProfile, CurrentUserContext, UserMembership } from "@/types/auth";

export const getCurrentUserContext = cache(async (): Promise<CurrentUserContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, default_tenant_id")
      .eq("id", user.id)
      .maybeSingle<CurrentProfile>(),
    supabase
      .from("user_memberships")
      .select("id, tenant_id, company_id, branch_id, user_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .returns<UserMembership[]>()
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    memberships: memberships ?? []
  };
});

export async function requireUser() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login?error=session-required");
  }

  if (context.memberships.length === 0) {
    redirect("/login?error=no-access");
  }

  return context;
}

export async function requireTenantMembership(tenantId: string) {
  const context = await requireUser();
  const membership = context.memberships.find(
    (item) => item.tenant_id === tenantId && item.status === "active"
  );

  if (!membership) {
    redirect("/login");
  }

  return {
    context,
    membership
  };
}
