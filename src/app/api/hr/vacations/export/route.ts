import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { buildVacationExcelXml } from "@/lib/hr/vacation-export";
import { loadVacationExportData } from "@/lib/hr/vacation-export-server";
import { vacationToday } from "@/lib/hr/vacation-certified";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const asOf = vacationToday();
  try {
    const data = await loadVacationExportData(createAdminClient(), ctx.membership.tenant_id, asOf);
    return new NextResponse(buildVacationExcelXml(data), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="resumen-vacaciones-${asOf}.xls"`,
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "X-Vacation-As-Of": asOf
      }
    });
  } catch {
    console.error("vacation_export_unavailable");
    return NextResponse.json({ ok: false, error: "vacation_export_unavailable" }, { status: 503 });
  }
}
