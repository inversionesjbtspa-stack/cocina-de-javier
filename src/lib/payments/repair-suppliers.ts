import { suppliersMaster, normalizeRut, type MasterSupplier } from "@/lib/suppliers/master";
import { createAdminClient } from "@/lib/supabase/admin";

type PayableSupplier = { id: string; rut: string | null; legal_name: string | null };
type PayableDte = {
  id: string;
  supplier_id: string | null;
  rut_emisor: string | null;
  razon_social_emisor: string | null;
  giro_emisor: string | null;
  dir_origen: string | null;
};
type RepairPayable = {
  id: string;
  tenant_id: string;
  company_id: string;
  supplier_id: string | null;
  suppliers: PayableSupplier | PayableSupplier[] | null;
  dte_documents: PayableDte | PayableDte[] | null;
};
type RepairActor = { role: string; userId: string; tenantId: string; companyId: string | null };

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function masterByRut() {
  return new Map(suppliersMaster.suppliers.map((supplier) => [normalizeRut(supplier.rut), supplier]));
}

function validMasterValue(value: string | null | undefined) {
  return Boolean(value && value.trim() && value.trim().toUpperCase() !== "#N/A");
}

async function hydrateFromMaster({
  master,
  supplier,
  tenantId
}: {
  master: MasterSupplier | undefined;
  supplier: { id: string; email: string | null; legal_name: string; phone: string | null; profile_source: string | null; trade_name: string | null };
  tenantId: string;
}) {
  if (!master) return { bankUpdated: 0, supplierUpdated: 0 };
  const supabase = createAdminClient();
  let supplierUpdated = 0;
  let bankUpdated = 0;
  const supplierPatch = {
    email: supplier.email || (validMasterValue(master.email) ? master.email : null),
    phone: supplier.phone || (validMasterValue(master.phone) ? master.phone : null),
    profile_source: supplier.profile_source === "manual" ? "manual" : "master proveedores jesus",
    trade_name: supplier.trade_name || (validMasterValue(master.tradeName) ? master.tradeName : null)
  };
  if (supplierPatch.email !== supplier.email || supplierPatch.phone !== supplier.phone || supplierPatch.trade_name !== supplier.trade_name || supplierPatch.profile_source !== supplier.profile_source) {
    await supabase.from("suppliers").update(supplierPatch).eq("id", supplier.id);
    supplierUpdated += 1;
  }

  if (!validMasterValue(master.bankName) || !validMasterValue(master.bankAccount)) return { bankUpdated, supplierUpdated };
  const { data: banks } = await supabase.from("supplier_bank_accounts").select("id,bank_name,bank_code,account_type,account_number").eq("supplier_id", supplier.id);
  const bank = (banks ?? []).find((row) => row.account_number === master.bankAccount) ?? (banks ?? [])[0];
  const bankCode = validMasterValue(master.bankCode) ? master.bankCode : null;
  if (bank) {
    const bankPatch = {
      account_number: bank.account_number || master.bankAccount,
      account_type: bank.account_type || master.accountType || "no_informada_master",
      bank_code: bank.bank_code || bankCode,
      bank_name: bank.bank_name || master.bankName
    };
    if (bankPatch.account_number !== bank.account_number || bankPatch.account_type !== bank.account_type || bankPatch.bank_code !== bank.bank_code || bankPatch.bank_name !== bank.bank_name) {
      await supabase.from("supplier_bank_accounts").update(bankPatch).eq("id", bank.id);
      bankUpdated += 1;
    }
  } else {
    await supabase.from("supplier_bank_accounts").insert({
      account_holder_name: master.businessName || supplier.legal_name,
      account_holder_rut: master.rut,
      account_number: master.bankAccount,
      account_type: master.accountType || "no_informada_master",
      bank_code: bankCode,
      bank_name: master.bankName,
      status: "pending_validation",
      supplier_id: supplier.id,
      tenant_id: tenantId
    });
    bankUpdated += 1;
  }
  return { bankUpdated, supplierUpdated };
}

export async function repairPaymentSuppliers(actor: RepairActor) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("accounts_payable")
    .select("id,tenant_id,company_id,supplier_id,suppliers(id,rut,legal_name),dte_documents(id,supplier_id,rut_emisor,razon_social_emisor,giro_emisor,dir_origen)")
    .eq("tenant_id", actor.tenantId)
    .limit(5000);
  if (error) throw error;
  const { data: supplierRows } = await supabase.from("suppliers").select("id,rut,legal_name,email,phone,profile_source,trade_name").eq("tenant_id", actor.tenantId).limit(5000);
  const suppliers = new Map((supplierRows ?? []).map((supplier) => [normalizeRut(supplier.rut), supplier]));
  const master = masterByRut();
  const summary = { bankProfilesCompleted: 0, created: 0, payablesReviewed: 0, relinked: 0, suppliersCompleted: 0, unresolved: [] as Array<{ payableId: string; reason: string }> };
  const changes: Array<{ payableId: string; from: string | null; to: string; rut: string }> = [];

  for (const payable of (data ?? []) as RepairPayable[]) {
    summary.payablesReviewed += 1;
    const dte = one(payable.dte_documents);
    const current = one(payable.suppliers);
    const rut = dte?.rut_emisor?.trim() ?? "";
    const normalizedRut = normalizeRut(rut);
    if (!dte || !normalizedRut) {
      summary.unresolved.push({ payableId: payable.id, reason: "DTE sin RUT emisor" });
      continue;
    }
    let supplier = suppliers.get(normalizedRut);
    if (!supplier) {
      const inserted = await supabase.from("suppliers").insert({
        address: dte.dir_origen || null,
        company_id: payable.company_id,
        giro: dte.giro_emisor || null,
        legal_name: dte.razon_social_emisor || rut,
        profile_source: "xml",
        rut,
        status: "draft",
        tenant_id: payable.tenant_id,
        trade_name: dte.razon_social_emisor || null
      }).select("id,rut,legal_name,email,phone,profile_source,trade_name").single();
      if (!inserted.data) {
        summary.unresolved.push({ payableId: payable.id, reason: "No se pudo crear proveedor XML" });
        continue;
      }
      supplier = inserted.data;
      suppliers.set(normalizedRut, supplier);
      summary.created += 1;
    }
    if (supplier.legal_name === "Cuenta por pagar" && dte.razon_social_emisor) {
      const completed = await supabase.from("suppliers").update({ legal_name: dte.razon_social_emisor, trade_name: supplier.trade_name || dte.razon_social_emisor }).eq("id", supplier.id).select("id,rut,legal_name,email,phone,profile_source,trade_name").single();
      supplier = completed.data ?? supplier;
      suppliers.set(normalizedRut, supplier);
    }
    const hydrated = await hydrateFromMaster({ master: master.get(normalizedRut), supplier, tenantId: payable.tenant_id });
    summary.bankProfilesCompleted += hydrated.bankUpdated;
    summary.suppliersCompleted += hydrated.supplierUpdated;
    if (payable.supplier_id !== supplier.id || normalizeRut(current?.rut ?? "") !== normalizedRut) {
      const updated = await supabase.from("accounts_payable").update({ supplier_id: supplier.id }).eq("id", payable.id);
      if (!updated.error) {
        changes.push({ from: payable.supplier_id, payableId: payable.id, rut, to: supplier.id });
        summary.relinked += 1;
      }
    }
    if (dte.supplier_id !== supplier.id) await supabase.from("dte_documents").update({ supplier_id: supplier.id }).eq("id", dte.id);
  }

  await supabase.from("audit_events").insert({
    actor_role: actor.role,
    actor_user_id: actor.userId,
    after_data: { ...summary, changes },
    company_id: actor.companyId,
    entity_type: "accounts_payable",
    event_type: "accounts_payable.payment_suppliers_repaired",
    tenant_id: actor.tenantId
  });
  return summary;
}
