import suppliersMaster from "../src/data/suppliers-master.json" with { type: "json" };
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false
  }
});

const { data: tenant, error: tenantError } = await supabase
  .from("tenants")
  .select("id")
  .eq("slug", "la-cocina-de-javier")
  .single();

if (tenantError || !tenant) {
  throw new Error(`Tenant not found: ${tenantError?.message ?? "missing"}`);
}

const { data: company } = await supabase
  .from("companies")
  .select("id")
  .eq("tenant_id", tenant.id)
  .limit(1)
  .maybeSingle();

let imported = 0;
let bankAccounts = 0;

for (const supplier of suppliersMaster.suppliers) {
  if (!supplier.rut || !supplier.businessName) {
    continue;
  }

  const { data: upserted, error } = await supabase
    .from("suppliers")
    .upsert(
      {
        category: supplier.category || null,
        company_id: company?.id ?? null,
        email: supplier.email || null,
        legal_name: supplier.businessName,
        payment_terms_days: 30,
        phone: supplier.phone || null,
        risk_notes: JSON.stringify({
          alerts: supplier.alerts,
          bankCode: supplier.bankCode || null,
          source: supplier.source,
          sourceCode: supplier.code || null
        }),
        rut: supplier.rut,
        status: "active",
        tenant_id: tenant.id,
        trade_name: supplier.tradeName || supplier.businessName
      },
      { onConflict: "tenant_id,rut" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Supplier ${supplier.rut}: ${error.message}`);
  }

  imported += 1;

  if (supplier.bankAccount && supplier.bankName) {
    await supabase.from("supplier_bank_accounts").delete().eq("supplier_id", upserted.id);
    const { error: bankError } = await supabase.from("supplier_bank_accounts").insert({
      account_holder_name: supplier.businessName,
      account_holder_rut: supplier.rut,
      account_number: supplier.bankAccount,
      account_type: supplier.accountType || "no_informada_master",
      bank_name: supplier.bankName,
      status: "pending_validation",
      supplier_id: upserted.id,
      tenant_id: tenant.id
    });

    if (bankError) {
      throw new Error(`Bank account ${supplier.rut}: ${bankError.message}`);
    }
    bankAccounts += 1;
  }
}

await supabase.from("audit_events").insert({
  after_data: {
    bankAccounts,
    imported,
    source: suppliersMaster.source,
    sourceFile: suppliersMaster.sourceFile,
    stats: suppliersMaster.stats
  },
  entity_type: "suppliers",
  event_type: "suppliers.master_imported",
  tenant_id: tenant.id
});

console.log(
  JSON.stringify(
    {
      bankAccounts,
      imported,
      ok: true,
      source: suppliersMaster.source
    },
    null,
    2
  )
);
