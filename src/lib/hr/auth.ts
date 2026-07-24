import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isHrAllowedRole } from "@/lib/hr/security";

export async function requireHrContext() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
      membership: null,
      user: null
    };
  }

  const membership = await auth
    .from("user_memberships")
    .select("tenant_id,company_id,role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership.data || !isHrAllowedRole(membership.data.role)) {
    return {
      error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
      membership: null,
      user: null
    };
  }

  return { error: null, membership: membership.data, user };
}
