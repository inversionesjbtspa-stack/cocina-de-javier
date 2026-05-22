import { NextResponse } from "next/server";
import { repairPaymentSuppliers } from "@/lib/payments/repair-suppliers";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager"].includes(membership.data.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const summary = await repairPaymentSuppliers({
    companyId: membership.data.company_id,
    role: membership.data.role,
    tenantId: membership.data.tenant_id,
    userId: user.id
  });
  return NextResponse.json({ ok: true, ...summary });
}
