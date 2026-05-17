import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtractedDteInvoice } from "@/lib/dte/types";

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function storagePath(tenantId: string, invoice: ExtractedDteInvoice) {
  return `${tenantId}/dte/${invoice.fechaEmision.slice(0, 7)}/${invoice.rutEmisor}/${invoice.tipoDte}-${invoice.folio}-${invoice.xmlSha256.slice(0, 12)}-${safeFilename(invoice.sourceFilename)}`;
}

function hashBuffer(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function persistExtractedDteInvoices(
  invoices: Array<{ invoice: ExtractedDteInvoice; xml: string }>
) {
  const supabase = createAdminClient();
  const results = [];

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "la-cocina-de-javier")
    .single();

  if (tenantError || !tenant) {
    throw tenantError ?? new Error("Tenant la-cocina-de-javier not found.");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .single();

  if (companyError || !company) {
    throw companyError ?? new Error("Main company not found.");
  }

  for (const item of invoices) {
    const invoice = item.invoice;
    const path = storagePath(tenant.id, invoice);
    const xmlHash = hashBuffer(item.xml);

    const { error: uploadError } = await supabase.storage
      .from("dte-xml-originals")
      .upload(path, item.xml, {
        contentType: "application/xml",
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .upsert(
        {
          tenant_id: tenant.id,
          company_id: company.id,
          rut: invoice.rutEmisor,
          legal_name: invoice.razonSocialEmisor ?? invoice.rutEmisor,
          trade_name: invoice.razonSocialEmisor,
          payment_terms_days: invoice.fechaVencimiento
            ? Math.max(
                0,
                Math.round(
                  (new Date(`${invoice.fechaVencimiento}T00:00:00`).getTime() -
                    new Date(`${invoice.fechaEmision}T00:00:00`).getTime()) /
                    86_400_000
                )
              )
            : 30,
          status: "active"
        },
        { onConflict: "tenant_id,rut" }
      )
      .select("id")
      .single();

    if (supplierError || !supplier) {
      throw supplierError ?? new Error(`Supplier ${invoice.rutEmisor} not persisted.`);
    }

    const { data: dte, error: dteError } = await supabase
      .from("dte_documents")
      .upsert(
        {
          tenant_id: tenant.id,
          company_id: company.id,
          supplier_id: supplier.id,
          tipo_dte: invoice.tipoDte,
          folio: invoice.folio,
          rut_emisor: invoice.rutEmisor,
          rut_receptor: invoice.rutReceptor,
          razon_social_emisor: invoice.razonSocialEmisor,
          razon_social_receptor: invoice.razonSocialReceptor,
          fecha_emision: invoice.fechaEmision,
          monto_neto: invoice.montoNeto,
          monto_exento: invoice.montoExento,
          iva: invoice.iva,
          monto_total: invoice.montoTotal,
          status: "parsed",
          sii_status: "pending_validation",
          xml_sha256: xmlHash,
          idempotency_key: invoice.idempotencyKey
        },
        { onConflict: "tenant_id,rut_emisor,tipo_dte,folio" }
      )
      .select("id")
      .single();

    if (dteError || !dte) {
      throw dteError ?? new Error(`DTE ${invoice.folio} not persisted.`);
    }

    await supabase.from("dte_xml_files").upsert(
      {
        tenant_id: tenant.id,
        dte_document_id: dte.id,
        storage_bucket: "dte-xml-originals",
        storage_path: path,
        content_type: "application/xml",
        sha256: xmlHash,
        size_bytes: Buffer.byteLength(item.xml)
      },
      { onConflict: "storage_bucket,storage_path" }
    );

    await supabase.from("dte_items").delete().eq("dte_document_id", dte.id);
    if (invoice.items.length) {
      const { error: itemsError } = await supabase.from("dte_items").insert(
        invoice.items.map((line) => ({
          tenant_id: tenant.id,
          dte_document_id: dte.id,
          line_number: line.lineNumber,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          line_total: line.lineTotal
        }))
      );

      if (itemsError) {
        throw itemsError;
      }
    }

    await supabase.from("dte_references").delete().eq("dte_document_id", dte.id);
    if (invoice.raw.references.length) {
      await supabase.from("dte_references").insert(
        invoice.raw.references.map((reference) => ({
          tenant_id: tenant.id,
          dte_document_id: dte.id,
          referenced_tipo_dte: reference.referencedTipoDte,
          referenced_folio: reference.referencedFolio,
          reference_date: reference.referenceDate,
          reason: reference.reason
        }))
      );
    }

    if (invoice.tipoDte !== "61") {
      await supabase.from("accounts_payable").upsert(
        {
          tenant_id: tenant.id,
          company_id: company.id,
          supplier_id: supplier.id,
          dte_document_id: dte.id,
          document_number: `${invoice.tipoDte}-${invoice.folio}`,
          issue_date: invoice.fechaEmision,
          due_date: invoice.fechaVencimiento ?? addDays(invoice.fechaEmision, 30),
          subtotal: invoice.montoNeto + invoice.montoExento,
          tax_amount: invoice.iva,
          total_amount: invoice.montoTotal,
          balance_amount: invoice.montoTotal,
          status: "pending_approval"
        },
        { onConflict: "tenant_id,supplier_id,document_number" }
      );
    }

    await supabase.from("audit_events").insert({
      tenant_id: tenant.id,
      company_id: company.id,
      event_type: "dte.xml_processed",
      entity_type: "dte_document",
      entity_id: dte.id,
      after_data: {
        folio: invoice.folio,
        rut_emisor: invoice.rutEmisor,
        source_message_id: invoice.sourceMessageId,
        xml_sha256: xmlHash
      }
    });

    results.push({
      folio: invoice.folio,
      rutEmisor: invoice.rutEmisor,
      dteDocumentId: dte.id,
      storagePath: path
    });
  }

  return results;
}
