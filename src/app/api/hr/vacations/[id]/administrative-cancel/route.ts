import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHrContext } from "@/lib/hr/auth";
import { createClient } from "@/lib/supabase/server";
import { vacationActionMessage } from "@/lib/hr/vacation-history";

export const runtime = "nodejs";
const schema = z.object({ reason: z.string().trim().min(1).max(800) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ ok: false, error: "Indica un motivo de anulación administrativa válido." }, { status: 422 });
  }
  const supabase = await createClient();
  const result = await supabase.rpc("hr_administratively_cancel_vacation_request", { p_request_id: id, p_reason: parsed.data.reason });
  if (result.error) {
    const code = result.error.message;
    const status = code === "vacation_not_found" ? 404 : code === "unauthorized" ? 401 : code === "hr_forbidden" ? 403 : 422;
    return NextResponse.json({ ok: false, code, error: vacationActionMessage(code) }, { status });
  }
  return NextResponse.json({ ok: true, result: result.data });
}
