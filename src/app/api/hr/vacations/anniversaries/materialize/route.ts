import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { materializeVacationAnniversaries } from "@/lib/hr/vacation-anniversaries";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET) return NextResponse.json({ ok: false, error: "cron_not_configured" }, { status: 503 });
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${serverEnv.CRON_SECRET}`))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const client = createAdminClient();
  const { data, error } = await client.from("hr_vacation_certified_openings").select("tenant_id");
  if (error) return NextResponse.json({ ok: false, error: "certified_openings_unavailable" }, { status: 503 });
  try {
    const result = await materializeVacationAnniversaries(client, (data ?? []).map(row => String(row.tenant_id)));
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "vacation_anniversary_materialization_failed" }, { status: 503 });
  }
}
