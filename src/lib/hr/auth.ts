import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedRoles = ["owner", "admin", "finance_manager"] as const;

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

  if (!membership.data || !allowedRoles.includes(membership.data.role as typeof allowedRoles[number])) {
    return {
      error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
      membership: null,
      user: null
    };
  }

  return { error: null, membership: membership.data, user };
}
