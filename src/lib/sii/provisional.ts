import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type RegistryRow = {
  id: string;
  tenant_id: string;
  company_id: string | null;
  periodo: string | null;
  rut_emisor: string;
  proveedor: string | null;
  razon_social: string | null;
  tipo_dte: string;
  folio: string;
  fecha_emision: string | null;
  monto_neto: number;
  iva: number;
  monto_total: number;
  estado_xml: string;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function createSiiProvisionalDocuments({
  ids,
  supabase,
  tenantId,
  userId
}: {
  ids?: string[];
  supabase: SupabaseClient;
  tenantId: string;
  userId: string;
}) {
  let query = supabase
    .from("sii_purchase_registry")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("estado_xml", "falta_xml")
    .limit(5000);
  if (ids?.length) query = query.in("id", ids);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as RegistryRow[];
  const summary = {
    cuentasPorPagarCreadas: 0,
    errores: [] as Array<{ id: string; folio: string; message: string }>,
    facturasProvisionalesCreadas: 0,
    notasCreditoOmitidas: 0,
    proveedoresCreados: 0,
    sinProveedor: 0,
    yaExistian: 0
  };

  for (const row of rows) {
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("id,rut,legal_name,trade_name")
        .eq("tenant_id", tenantId)
        .eq("id", row.company_id ?? "")
        .maybeSingle();
      const { data: fallbackCompany } = company ? { data: null } : await supabase
        .from("companies")
        .select("id,rut,legal_name,trade_name")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();
      const companyRow = company ?? fallbackCompany;
      if (!companyRow?.id) throw new Error("Empresa principal no encontrada.");

      const supplierName = row.razon_social ?? row.proveedor ?? row.rut_emisor;
      const { data: supplier, error: supplierError } = await supabase
        .from("suppliers")
        .upsert({
          company_id: companyRow.id,
          legal_name: supplierName,
          profile_source: "sii",
          rut: row.rut_emisor,
          status: "draft",
          tenant_id: tenantId,
          trade_name: supplierName
        }, { onConflict: "tenant_id,rut" })
        .select("id,payment_terms_days")
        .single();
      if (supplierError || !supplier?.id) throw supplierError ?? new Error("Proveedor no persistido.");
      if (!supplierError) summary.proveedoresCreados += 1;

      const issuedAt = row.fecha_emision ?? new Date().toISOString().slice(0, 10);
      const documentNumber = `${row.tipo_dte}-${row.folio}`;
      const idempotencyKey = `sii:${row.rut_emisor}:${row.tipo_dte}:${row.folio}`;
      const xmlHash = `sii-${hash(idempotencyKey).slice(0, 60)}`;
      const { data: existingDte } = await supabase
        .from("dte_documents")
        .select("id,source_type")
        .eq("tenant_id", tenantId)
        .eq("rut_emisor", row.rut_emisor)
        .eq("tipo_dte", row.tipo_dte)
        .eq("folio", row.folio)
        .maybeSingle();

      const { data: dte, error: dteError } = await supabase
        .from("dte_documents")
        .upsert({
          company_id: companyRow.id,
          fecha_emision: issuedAt,
          folio: row.folio,
          idempotency_key: idempotencyKey,
          iva: Number(row.iva ?? 0),
          monto_exento: 0,
          monto_neto: Number(row.monto_neto ?? 0),
          monto_total: Number(row.monto_total ?? 0),
          payment_status: "pending",
          razon_social_emisor: supplierName,
          razon_social_receptor: companyRow.legal_name ?? companyRow.trade_name ?? "La Cocina de Javier",
          rut_emisor: row.rut_emisor,
          rut_receptor: companyRow.rut,
          sii_purchase_registry_id: row.id,
          sii_status: "sii_registry_only",
          source_type: "sii",
          status: "received",
          supplier_id: supplier.id,
          tenant_id: tenantId,
          tipo_dte: row.tipo_dte,
          validation_status: "warning",
          xml_sha256: xmlHash,
          xml_status: "missing"
        }, { onConflict: "tenant_id,rut_emisor,tipo_dte,folio" })
        .select("id")
        .single();
      if (dteError || !dte?.id) throw dteError ?? new Error("Factura provisional no persistida.");
      if (existingDte) summary.yaExistian += 1;
      else summary.facturasProvisionalesCreadas += 1;

      let payableId: string | null = null;
      if (row.tipo_dte === "61") {
        summary.notasCreditoOmitidas += 1;
      } else {
        const { data: existingPayable } = await supabase
          .from("accounts_payable")
          .select("id,status")
          .eq("tenant_id", tenantId)
          .eq("supplier_id", supplier.id)
          .eq("document_number", documentNumber)
          .maybeSingle();
        if (existingPayable?.id) {
          payableId = existingPayable.id;
          await supabase.from("accounts_payable").update({
            dte_document_id: dte.id,
            is_payable_without_xml: true,
            sii_purchase_registry_id: row.id,
            source_type: "sii",
            xml_status: "missing"
          }).eq("id", existingPayable.id);
          summary.yaExistian += 1;
        } else {
          const terms = Number(supplier.payment_terms_days ?? 30);
          const dueDate = addDays(issuedAt, Number.isFinite(terms) ? terms : 0);
          const { data: payable, error: payableError } = await supabase
            .from("accounts_payable")
            .insert({
              balance_amount: Number(row.monto_total ?? 0),
              company_id: companyRow.id,
              document_number: documentNumber,
              dte_document_id: dte.id,
              due_date: dueDate,
              due_date_estimated: true,
              is_payable_without_xml: true,
              issue_date: issuedAt,
              sii_purchase_registry_id: row.id,
              source_type: "sii",
              status: "pending_approval",
              subtotal: Number(row.monto_neto ?? 0),
              supplier_id: supplier.id,
              tax_amount: Number(row.iva ?? 0),
              tenant_id: tenantId,
              total_amount: Number(row.monto_total ?? 0),
              xml_status: "missing"
            })
            .select("id")
            .single();
          if (payableError || !payable?.id) throw payableError ?? new Error("Cuenta por pagar no persistida.");
          payableId = payable.id;
          summary.cuentasPorPagarCreadas += 1;
        }
      }

      await supabase.from("sii_purchase_registry").update({
        accounts_payable_id: payableId,
        payable_created_at: payableId ? new Date().toISOString() : null,
        payment_status: "pending",
        provisional_dte_document_id: dte.id
      }).eq("id", row.id);

      await supabase.from("audit_events").insert({
        actor_user_id: userId,
        after_data: {
          accounts_payable_id: payableId,
          dte_document_id: dte.id,
          folio: row.folio,
          rut_emisor: row.rut_emisor,
          tipo_dte: row.tipo_dte
        },
        company_id: companyRow.id,
        entity_id: dte.id,
        entity_type: "sii_purchase_registry",
        event_type: "sii.provisional_invoice_sent_to_treasury",
        tenant_id: tenantId
      });
    } catch (error) {
      summary.errores.push({
        folio: row.folio,
        id: row.id,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { processed: rows.length, ...summary };
}
