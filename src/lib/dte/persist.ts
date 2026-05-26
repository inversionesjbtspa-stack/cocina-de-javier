import { createHash } from "node:crypto";
import { DTE_XML_GMAIL_QUERY } from "@/lib/dte/inbox";
import { syncSiiRegistryForDte } from "@/lib/sii/registry-store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtractedDteInvoice } from "@/lib/dte/types";

type PersistInput = Array<{ invoice: ExtractedDteInvoice; xml: string }>;

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

function paymentTermsDays(invoice: ExtractedDteInvoice) {
  if (!invoice.fechaVencimiento) {
    return 30;
  }
  return Math.max(
    0,
    Math.round(
      (new Date(`${invoice.fechaVencimiento}T00:00:00`).getTime() -
        new Date(`${invoice.fechaEmision}T00:00:00`).getTime()) /
        86_400_000
    )
  );
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 240);
}

async function ensureProductForItem({
  invoice,
  itemId,
  line,
  supplierId,
  tenantId,
  dteDocumentId
}: {
  invoice: ExtractedDteInvoice;
  itemId: string | null;
  line: ExtractedDteInvoice["items"][number];
  supplierId: string;
  tenantId: string;
  dteDocumentId: string;
}) {
  const supabase = createAdminClient();
  const name = normalizeName(line.name);
  if (!line.productEligible || !name) {
    return null;
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .upsert(
      {
        description: line.rawDescription ?? line.description,
        name,
        status: "active",
        tenant_id: tenantId,
        unit: line.unit
      },
      { onConflict: "tenant_id,name" }
    )
    .select("id")
    .single();

  if (productError || !product?.id) {
    throw productError ?? new Error(`Product ${name} not persisted.`);
  }

  await supabase.from("product_supplier_links").upsert(
    {
      last_purchase_at: invoice.fechaEmision,
      last_purchase_price: line.unitPrice,
      product_id: product.id,
      supplier_id: supplierId,
      supplier_product_code: line.codeValue,
      tenant_id: tenantId
    },
    { onConflict: "tenant_id,product_id,supplier_id" }
  );

  if (itemId) {
    await supabase.from("dte_items").update({ product_id: product.id }).eq("id", itemId);
  }

  if (line.priceConfidenceScore >= 90 && line.unitPrice > 0) {
    await supabase.from("product_price_history").insert({
      effective_date: invoice.fechaEmision,
      price: line.unitPrice,
      product_id: product.id,
      source_entity_id: dteDocumentId,
      source_entity_type: "dte_document",
      supplier_id: supplierId,
      tenant_id: tenantId
    });
  }

  return product.id as string;
}

export async function persistExtractedDteInvoices(invoices: PersistInput) {
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

  const { data: syncRun } = await supabase
    .from("dte_sync_runs")
    .insert({
      provider: "gmail",
      query: DTE_XML_GMAIL_QUERY,
      status: "running",
      tenant_id: tenant.id,
      attachments_found: invoices.length
    })
    .select("id")
    .maybeSingle();

  let newCount = 0;
  let duplicateCount = 0;

  for (const item of invoices) {
    const invoice = item.invoice;
    const path = storagePath(tenant.id, invoice);
    const xmlHash = hashBuffer(item.xml);

    const { data: existingByKey } = await supabase
      .from("dte_documents")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("idempotency_key", invoice.idempotencyKey)
      .maybeSingle();
    const { data: existingByDocument } = existingByKey
      ? { data: null }
      : await supabase
          .from("dte_documents")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("rut_emisor", invoice.rutEmisor)
          .eq("tipo_dte", invoice.tipoDte)
          .eq("folio", invoice.folio)
          .maybeSingle();
    const existing = existingByKey ?? existingByDocument;

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
          address: invoice.dirOrigen,
          company_id: company.id,
          giro: invoice.giroEmisor,
          legal_name: invoice.razonSocialEmisor ?? invoice.rutEmisor,
          payment_terms_days: paymentTermsDays(invoice),
          rut: invoice.rutEmisor,
          status: "active",
          tenant_id: tenant.id,
          trade_name: invoice.razonSocialEmisor
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
          acteco: invoice.acteco,
          caf_json: invoice.raw.caf,
          cdg_sii_sucur: invoice.cdgSiiSucur,
          ciudad_origen: invoice.ciudadOrigen,
          ciudad_receptor: invoice.ciudadReceptor,
          cmna_origen: invoice.cmnaOrigen,
          cmna_receptor: invoice.cmnaReceptor,
          company_id: company.id,
          dir_origen: invoice.dirOrigen,
          dir_receptor: invoice.dirReceptor,
          fecha_emision: invoice.fechaEmision,
          fecha_vencimiento: invoice.fechaVencimiento,
          folio: invoice.folio,
          forma_pago: invoice.formaPago,
          frmt: invoice.raw.frmt,
          giro_emisor: invoice.giroEmisor,
          giro_receptor: invoice.giroReceptor,
          gmail_attachment_id: invoice.sourceAttachmentId,
          gmail_filename: invoice.sourceFilename,
          gmail_message_id: invoice.sourceMessageId,
          gmail_received_at: invoice.sourceReceivedAt,
          gmail_sender: invoice.sourceSender,
          gmail_subject: invoice.sourceSubject,
          gmail_thread_id: invoice.sourceThreadId,
          idempotency_key: invoice.idempotencyKey,
          iva: invoice.iva,
          iva_uso_comun: invoice.ivaUsoComun,
          mnt_bruto: invoice.montoBruto,
          monto_exento: invoice.montoExento,
          monto_neto: invoice.montoNeto,
          monto_periodo: invoice.montoPeriodo,
          monto_total: invoice.montoTotal,
          raw_json: invoice.raw.parsedJson,
          raw_emitter_json: invoice.raw.emitter,
          raw_receiver_json: invoice.raw.receiver,
          parser_version: "dte-parser-v2",
          parser_warnings: invoice.raw.parserWarnings,
          parser_errors: invoice.raw.parserErrors,
          confidence_score: invoice.raw.validation.confidenceScore,
          razon_social_emisor: invoice.razonSocialEmisor,
          razon_social_receptor: invoice.razonSocialReceptor,
          rut_emisor: invoice.rutEmisor,
          rut_receptor: invoice.rutReceptor,
          sii_status: "pending_validation",
          source_provider: "gmail",
          status: "parsed",
          supplier_id: supplier.id,
          tasa_iva: invoice.tasaIva,
          ted_json: invoice.raw.ted,
          tenant_id: tenant.id,
          term_pago_glosa: invoice.termPagoGlosa,
          tipo_dte: invoice.tipoDte,
          tpo_tran_compra: invoice.tipoTranCompra,
          tpo_tran_venta: invoice.tipoTranVenta,
          validation_errors: invoice.raw.validation.errors,
          validation_status: invoice.raw.validation.status,
          validation_warnings: invoice.raw.validation.warnings,
          vlr_pagar: invoice.valorPagar,
          xml_original: item.xml,
          xml_sha256: xmlHash
        },
        { onConflict: "tenant_id,rut_emisor,tipo_dte,folio" }
      )
      .select("id")
      .single();

    if (dteError || !dte) {
      throw dteError ?? new Error(`DTE ${invoice.folio} not persisted.`);
    }

    if (existing) {
      duplicateCount += 1;
    } else {
      newCount += 1;
    }

    await supabase.from("dte_xml_files").upsert(
      {
        content_type: "application/xml",
        dte_document_id: dte.id,
        sha256: xmlHash,
        size_bytes: Buffer.byteLength(item.xml),
        storage_bucket: "dte-xml-originals",
        storage_path: path,
        tenant_id: tenant.id
      },
      { onConflict: "storage_bucket,storage_path" }
    );

    await supabase.from("dte_items").delete().eq("dte_document_id", dte.id);
    await supabase.from("dte_references").delete().eq("dte_document_id", dte.id);
    await supabase.from("dte_taxes").delete().eq("dte_document_id", dte.id);
    await supabase.from("dte_global_discounts").delete().eq("dte_document_id", dte.id);
    await supabase.from("product_price_history").delete().eq("source_entity_id", dte.id);

    if (invoice.items.length) {
      const { data: insertedItems, error: itemsError } = await supabase
        .from("dte_items")
        .insert(
          invoice.items.map((line) => ({
            additional_tax_code: line.additionalTaxCode,
            item_additional_tax_codes: line.additionalTaxCode ? [line.additionalTaxCode] : [],
            code_type: line.codeType,
            code_value: line.codeValue,
            description: line.description,
            detail_description: line.description,
            discount_amount: line.discountAmount,
            discount_pct: line.discountPct,
            dte_document_id: dte.id,
            item_code: line.itemCode,
            item_description_raw: line.description,
            item_name_raw: line.rawName,
            item_name_normalized: line.normalizedName,
            item_validation_errors: line.validationErrors,
            item_validation_status: line.validationStatus,
            line_number: line.lineNumber,
            line_total: line.lineTotal,
            name: line.name,
            price_confidence_score: line.priceConfidenceScore,
            quantity: line.quantity,
            raw_json: line.raw,
            surcharge_amount: line.surchargeAmount,
            surcharge_pct: line.surchargePct,
            tenant_id: tenant.id,
            unit: line.unit,
            unit_price: line.unitPrice
          }))
        )
        .select("id,line_number");

      if (itemsError) {
        throw itemsError;
      }

      const itemIdByLine = new Map(
        (insertedItems ?? []).map((line) => [Number(line.line_number), line.id as string])
      );

      const itemTaxRows = invoice.raw.taxes
        .filter((tax) => tax.lineNumber)
        .map((tax) => ({
          dte_document_id: dte.id,
          dte_item_id: itemIdByLine.get(Number(tax.lineNumber)) ?? null,
          monto_imp: tax.montoImp,
          raw_json: tax.raw,
          tasa_imp: tax.tasaImp,
          tenant_id: tenant.id,
          tipo_imp: tax.tipoImp
        }));

      if (itemTaxRows.length) {
        await supabase.from("dte_taxes").insert(itemTaxRows);
      }

      for (const line of invoice.items) {
        await ensureProductForItem({
          dteDocumentId: dte.id,
          invoice,
          itemId: itemIdByLine.get(line.lineNumber) ?? null,
          line,
          supplierId: supplier.id,
          tenantId: tenant.id
        });
      }
    }

    if (invoice.raw.references.length) {
      await supabase.from("dte_references").insert(
        invoice.raw.references.map((reference) => ({
          dte_document_id: dte.id,
          line_number: reference.lineNumber,
          raw_json: reference.raw,
          reason: reference.reason,
          reference_code: reference.referenceCode,
          reference_date: reference.referenceDate,
          referenced_folio: reference.referencedFolio,
          referenced_tipo_dte: reference.referencedTipoDte,
          tenant_id: tenant.id
        }))
      );
    }

    const totalTaxRows = invoice.raw.taxes
      .filter((tax) => !tax.lineNumber)
      .map((tax) => ({
        dte_document_id: dte.id,
        monto_imp: tax.montoImp,
        raw_json: tax.raw,
        tasa_imp: tax.tasaImp,
        tenant_id: tenant.id,
        tipo_imp: tax.tipoImp
      }));
    if (totalTaxRows.length) {
      await supabase.from("dte_taxes").insert(totalTaxRows);
    }

    if (invoice.raw.globalDiscounts.length) {
      await supabase.from("dte_global_discounts").insert(
        invoice.raw.globalDiscounts.map((discount) => ({
          description: discount.description,
          dte_document_id: dte.id,
          exempt_indicator: discount.exemptIndicator,
          line_number: discount.lineNumber,
          movement_type: discount.movementType,
          other_currency_value: discount.otherCurrencyValue,
          raw_json: discount.raw,
          tenant_id: tenant.id,
          value: discount.value,
          value_type: discount.valueType
        }))
      );
    }

    if (invoice.tipoDte !== "61") {
      await supabase.from("accounts_payable").upsert(
        {
          balance_amount: invoice.montoTotal,
          company_id: company.id,
          document_number: `${invoice.tipoDte}-${invoice.folio}`,
          dte_document_id: dte.id,
          due_date: invoice.fechaVencimiento ?? addDays(invoice.fechaEmision, 30),
          issue_date: invoice.fechaEmision,
          status: "pending_approval",
          subtotal: invoice.montoNeto + invoice.montoExento,
          supplier_id: supplier.id,
          tax_amount: invoice.iva,
          tenant_id: tenant.id,
          total_amount: invoice.montoTotal
        },
        { onConflict: "tenant_id,supplier_id,document_number" }
      );
    }

    await syncSiiRegistryForDte({
      companyId: company.id,
      dteDocumentId: dte.id,
      folio: invoice.folio,
      gmailMessageId: invoice.sourceMessageId,
      montoTotal: invoice.montoTotal,
      receivedAt: invoice.sourceReceivedAt,
      rutEmisor: invoice.rutEmisor,
      supabase,
      tenantId: tenant.id,
      tipoDte: invoice.tipoDte
    }).catch(() => null);

    if (!existing) {
      await supabase.from("audit_events").insert({
        after_data: {
          duplicate: false,
          folio: invoice.folio,
          gmail_message_id: invoice.sourceMessageId,
          rut_emisor: invoice.rutEmisor,
          xml_sha256: xmlHash
        },
        company_id: company.id,
        entity_id: dte.id,
        entity_type: "dte_document",
        event_type: "dte.xml_processed",
        tenant_id: tenant.id
      });
    }

    results.push({
      dteDocumentId: dte.id,
      duplicate: Boolean(existing),
      folio: invoice.folio,
      rutEmisor: invoice.rutEmisor,
      storagePath: path
    });
  }

  if (syncRun?.id) {
    await supabase
      .from("dte_sync_runs")
      .update({
        duplicate_count: duplicateCount,
        finished_at: new Date().toISOString(),
        new_count: newCount,
        processed_count: invoices.length,
        status: "completed",
        summary: {
          new_count: newCount,
          duplicate_count: duplicateCount,
          processed_count: invoices.length
        }
      })
      .eq("id", syncRun.id);
  }

  await supabase.from("audit_events").insert({
    after_data: {
      duplicates: duplicateCount,
      duration_ms: null,
      errors: 0,
      new_xml: newCount,
      processed: invoices.length,
      sync_run_id: syncRun?.id ?? null
    },
    company_id: company.id,
    entity_id: syncRun?.id ?? null,
    entity_type: "dte_sync_run",
    event_type: "dte.xml_sync_completed",
    tenant_id: tenant.id
  });

  return results;
}
