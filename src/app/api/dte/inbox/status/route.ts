import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const { data: lastRun, error: runError } = await supabase
    .from("dte_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count: totalDocuments, error: countError } = await supabase
    .from("dte_documents")
    .select("id", { count: "exact", head: true });
  const { count: totalErrors } = await supabase
    .from("dte_processing_errors")
    .select("id", { count: "exact", head: true });

  const nextSync = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  return NextResponse.json(
    {
      ok: !runError && !countError,
      lastSync: lastRun,
      nextSync,
      totalDocuments,
      totalErrors,
      error: runError?.message ?? countError?.message
    },
    { status: runError || countError ? 503 : 200 }
  );
}
