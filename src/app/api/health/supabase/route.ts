import { NextResponse } from "next/server";
import { hasSupabaseAdminConfig, hasSupabasePublicConfig, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const criticalTables = [
  "tenants",
  "companies",
  "profiles",
  "permissions",
  "role_permissions",
  "user_memberships",
  "suppliers",
  "products",
  "purchase_requests",
  "purchase_orders",
  "dte_documents",
  "accounts_payable",
  "payment_batches",
  "payments",
  "budgets",
  "audit_events"
];

const requiredBuckets = [
  "dte-xml-originals",
  "dte-pdf-rendered",
  "purchase-attachments",
  "payment-files",
  "report-exports"
];

function isAuthorized(request: Request) {
  if (!serverEnv.CRON_SECRET) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${serverEnv.CRON_SECRET}`;
}

export async function GET(request: Request) {
  const publicConfigured = hasSupabasePublicConfig();
  const adminConfigured = hasSupabaseAdminConfig();

  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: publicConfigured && adminConfigured,
        publicConfigured,
        adminConfigured,
        protected: true,
        detail: "Full table, storage and write checks require server authorization."
      },
      { status: publicConfigured && adminConfigured ? 200 : 503 }
    );
  }

  if (!publicConfigured || !adminConfigured) {
    return NextResponse.json(
      {
        ok: false,
        publicConfigured,
        adminConfigured,
        error: "supabase_not_configured"
      },
      { status: 503 }
    );
  }

  const supabase = createAdminClient();
  const tableChecks = await Promise.all(
    criticalTables.map(async (table) => {
      const { error } = await supabase
        .from(table)
        .select("*")
        .limit(1);

      return {
        table,
        ok: !error,
        error: error?.message
      };
    })
  );

  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  const bucketNames = new Set((buckets ?? []).map((bucket) => bucket.name));
  const bucketChecks = requiredBuckets.map((bucket) => ({
    bucket,
    ok: bucketNames.has(bucket)
  }));

  const writeCheck = await supabase.from("audit_events").insert({
    event_type: "supabase.health_check",
    entity_type: "system",
    after_data: {
      source: "vercel",
      checked_at: new Date().toISOString()
    }
  });

  const ok =
    tableChecks.every((check) => check.ok) &&
    !bucketsError &&
    bucketChecks.every((check) => check.ok) &&
    !writeCheck.error;

  return NextResponse.json(
    {
      ok,
      publicConfigured,
      adminConfigured,
      tables: tableChecks,
      storage: {
        ok: !bucketsError && bucketChecks.every((check) => check.ok),
        buckets: bucketChecks,
        error: bucketsError?.message
      },
      write: {
        ok: !writeCheck.error,
        table: "audit_events",
        error: writeCheck.error?.message
      },
      checkedAt: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
