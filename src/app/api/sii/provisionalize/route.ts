import { NextResponse } from "next/server";
import { createSiiProvisionalDocuments } from "@/lib/sii/provisional";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function context() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }), membership: null, user: null };
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager", "accountant"].includes(membership.data.role)) {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }), membership: null, user: null };
  }
  return { error: null, membership: membership.data, user };
}

export async function POST(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : undefined;
  try {
    const result = await createSiiProvisionalDocuments({
      ids,
      supabase: createAdminClient(),
      tenantId: ctx.membership.tenant_id,
      userId: ctx.user.id
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
    console.error({
      error: record.message ?? String(error),
      stack: error instanceof Error ? error.stack : null,
      stage: "sii_provisionalize"
    });
    return NextResponse.json({
      ok: false,
      detail: record,
      error: record.message ?? String(error)
    }, { status: 500 });
  }
}
