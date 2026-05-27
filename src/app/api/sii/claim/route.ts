import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager", "accountant"].includes(membership.data.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    rutEmisor?: string;
    ids?: string[];
    claimStatus?: "copiado" | "enviado" | "enviado_manualmente" | "resuelto" | "ignorado" | "pendiente";
  };
  const status = body.claimStatus === "enviado" ? "enviado_manualmente" : body.claimStatus ?? "copiado";
  const supabase = createAdminClient();
  let query = supabase.from("sii_purchase_registry").update({ claim_status: status }).eq("tenant_id", membership.data.tenant_id);
  if (body.rutEmisor) query = query.eq("rut_emisor", body.rutEmisor).eq("estado_xml", "falta_xml");
  if (body.ids?.length) query = query.in("id", body.ids);
  const { data, error } = await query.select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const updated = data?.length ?? 0;
  await supabase.from("audit_events").insert({
    actor_user_id: user.id,
    after_data: { claim_status: status, ids: body.ids ?? null, rut_emisor: body.rutEmisor ?? null, updated },
    company_id: membership.data.company_id,
    entity_type: "sii_purchase_registry",
    event_type: status === "copiado" ? "sii.claim_copied" : "sii.claim_status_updated",
    tenant_id: membership.data.tenant_id
  });
  return NextResponse.json({ ok: true, updated });
}
