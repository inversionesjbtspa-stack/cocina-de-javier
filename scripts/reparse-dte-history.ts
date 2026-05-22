import pg from "pg";
import { parseDteXml } from "../src/lib/dte/parser.ts";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const dryRun = process.argv.includes("--dry-run");
const orphanOnly = process.argv.includes("--orphan-only");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const folioArg = process.argv.find((value) => value.startsWith("--folio="));
const limit = Math.min(Number(limitArg?.split("=")[1] ?? 5000), 5000);
const folio = folioArg?.split("=")[1] ?? null;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

type DteDocumentRow = {
  id: string;
  tenant_id: string;
  supplier_id: string | null;
  folio: string;
  tipo_dte: string;
  rut_emisor: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  gmail_attachment_id: string | null;
  gmail_filename: string | null;
  gmail_received_at: string | null;
  gmail_sender: string | null;
  gmail_subject: string | null;
  xml_original: string;
};

type OrphanItemRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  description: string;
  item_description_raw: string | null;
  unit: string | null;
  unit_price: number;
  supplier_id: string;
  fecha_emision: string;
};

function productName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 240);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

try {
  const documents = await client.query(
    `select id, tenant_id, supplier_id, folio, tipo_dte, rut_emisor, gmail_message_id,
            gmail_thread_id, gmail_attachment_id, gmail_filename, gmail_received_at,
            gmail_sender, gmail_subject, xml_original
       from public.dte_documents
      where xml_original is not null
        and ($1::text is null or folio = $1)
      order by fecha_emision desc
      limit $2`,
    [folio, limit]
  );

  const summary = {
    candidates: documents.rowCount ?? 0,
    documents: 0,
    items: 0,
    itemTaxes: 0,
    products: 0,
    rejected: 0
  };

  for (const document of orphanOnly ? [] : (documents.rows as DteDocumentRow[])) {
    try {
      const invoice = parseDteXml({
        sourceAttachmentId: document.gmail_attachment_id ?? `${document.id}:xml_original`,
        sourceFilename: document.gmail_filename ?? `${document.tipo_dte}-${document.folio}.xml`,
        sourceMessageId: document.gmail_message_id ?? document.id,
        sourceReceivedAt: document.gmail_received_at,
        sourceSender: document.gmail_sender,
        sourceSubject: document.gmail_subject,
        sourceThreadId: document.gmail_thread_id,
        xml: document.xml_original
      });

      if (dryRun) {
        summary.documents += 1;
        summary.items += invoice.items.length;
        summary.itemTaxes += invoice.raw.taxes.filter((tax) => tax.lineNumber).length;
        summary.products += invoice.items.filter((item) => item.productEligible).length;
        continue;
      }

      await client.query("begin");
      await client.query(
        `update public.dte_documents
            set raw_json = $2::jsonb,
                raw_emitter_json = $3::jsonb,
                raw_receiver_json = $4::jsonb,
                parser_version = 'dte-parser-v3',
                parser_warnings = $5::jsonb,
                parser_errors = $6::jsonb,
                validation_warnings = $7::jsonb,
                validation_errors = $8::jsonb,
                validation_status = $9,
                confidence_score = $10,
                razon_social_emisor = $11,
                razon_social_receptor = $12,
                giro_emisor = $13,
                dir_origen = $14,
                cmna_origen = $15,
                ciudad_origen = $16,
                giro_receptor = $17,
                dir_receptor = $18,
                cmna_receptor = $19,
                ciudad_receptor = $20,
                updated_at = now()
          where id = $1`,
        [
          document.id,
          JSON.stringify(invoice.raw.parsedJson),
          JSON.stringify(invoice.raw.emitter),
          JSON.stringify(invoice.raw.receiver),
          JSON.stringify(invoice.raw.parserWarnings),
          JSON.stringify(invoice.raw.parserErrors),
          JSON.stringify(invoice.raw.validation.warnings),
          JSON.stringify(invoice.raw.validation.errors),
          invoice.raw.validation.status,
          invoice.raw.validation.confidenceScore,
          invoice.razonSocialEmisor,
          invoice.razonSocialReceptor,
          invoice.giroEmisor,
          invoice.dirOrigen,
          invoice.cmnaOrigen,
          invoice.ciudadOrigen,
          invoice.giroReceptor,
          invoice.dirReceptor,
          invoice.cmnaReceptor,
          invoice.ciudadReceptor
        ]
      );
      if (document.supplier_id) {
        await client.query(
          `update public.suppliers
              set legal_name = coalesce(nullif(legal_name, ''), $2),
                  trade_name = coalesce(nullif(trade_name, ''), $2),
                  giro = coalesce(nullif(giro, ''), $3),
                  address = coalesce(nullif(address, ''), $4),
                  updated_at = now()
            where id = $1`,
          [document.supplier_id, invoice.razonSocialEmisor, invoice.giroEmisor, invoice.dirOrigen]
        );
      }
      await client.query("delete from public.dte_references where dte_document_id = $1", [document.id]);
      await client.query("delete from public.dte_taxes where dte_document_id = $1", [document.id]);
      await client.query("delete from public.dte_global_discounts where dte_document_id = $1", [document.id]);
      await client.query("delete from public.dte_items where dte_document_id = $1", [document.id]);
      await client.query("delete from public.product_price_history where source_entity_id = $1", [document.id]);

      const itemIds = new Map<number, string>();
      for (const item of invoice.items) {
        const insertedItem = await client.query(
          `insert into public.dte_items (
             tenant_id, dte_document_id, line_number, description, name, item_name_raw,
             item_description_raw, detail_description, item_name_normalized, item_code,
             code_type, code_value, quantity, unit, unit_price, discount_pct, discount_amount,
             surcharge_pct, surcharge_amount, additional_tax_code, item_additional_tax_codes,
             line_total, raw_json, item_validation_status, item_validation_errors,
             price_confidence_score
           ) values (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
             $22,$23::jsonb,$24,$25::jsonb,$26
           ) returning id`,
          [
            document.tenant_id,
            document.id,
            item.lineNumber,
            item.description,
            item.name,
            item.rawName,
            item.rawDescription,
            item.description,
            item.normalizedName,
            item.itemCode,
            item.codeType,
            item.codeValue,
            item.quantity,
            item.unit,
            item.unitPrice,
            item.discountPct,
            item.discountAmount,
            item.surchargePct,
            item.surchargeAmount,
            item.additionalTaxCode,
            item.additionalTaxCode ? [item.additionalTaxCode] : [],
            item.lineTotal,
            JSON.stringify(item.raw),
            item.validationStatus,
            JSON.stringify(item.validationErrors),
            item.priceConfidenceScore
          ]
        );
        const itemId = insertedItem.rows[0].id as string;
        itemIds.set(item.lineNumber, itemId);
        summary.items += 1;

        if (!item.productEligible || !document.supplier_id) {
          continue;
        }
        const upsertedProduct = await client.query(
          `insert into public.products (tenant_id, name, description, unit, status)
             values ($1,$2,$3,$4,'active')
           on conflict (tenant_id, name)
             do update set description = coalesce(public.products.description, excluded.description),
                           unit = coalesce(nullif(public.products.unit, ''), excluded.unit),
                           updated_at = now()
           returning id`,
          [document.tenant_id, productName(item.name), item.rawDescription ?? item.description, item.unit]
        );
        const productId = upsertedProduct.rows[0].id as string;
        await client.query("update public.dte_items set product_id = $2 where id = $1", [itemId, productId]);
        await client.query(
          `insert into public.product_supplier_links (
             tenant_id, product_id, supplier_id, supplier_product_code, last_purchase_price, last_purchase_at
           ) values ($1,$2,$3,$4,$5,$6)
           on conflict (tenant_id, product_id, supplier_id)
             do update set supplier_product_code = coalesce(excluded.supplier_product_code, public.product_supplier_links.supplier_product_code),
                           last_purchase_price = excluded.last_purchase_price,
                           last_purchase_at = excluded.last_purchase_at,
                           updated_at = now()`,
          [document.tenant_id, productId, document.supplier_id, item.codeValue, item.unitPrice, invoice.fechaEmision]
        );
        if (item.priceConfidenceScore >= 90 && item.unitPrice > 0) {
          await client.query(
            `insert into public.product_price_history (
               tenant_id, product_id, supplier_id, source_entity_type, source_entity_id, price, effective_date
             ) values ($1,$2,$3,'dte_document',$4,$5,$6)`,
            [document.tenant_id, productId, document.supplier_id, document.id, item.unitPrice, invoice.fechaEmision]
          );
        }
        summary.products += 1;
      }

      for (const reference of invoice.raw.references) {
        await client.query(
          `insert into public.dte_references (
             tenant_id, dte_document_id, line_number, referenced_tipo_dte, referenced_folio,
             reference_date, reference_code, reason, raw_json
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [
            document.tenant_id,
            document.id,
            reference.lineNumber,
            reference.referencedTipoDte,
            reference.referencedFolio,
            reference.referenceDate,
            reference.referenceCode,
            reference.reason,
            JSON.stringify(reference.raw)
          ]
        );
      }

      for (const tax of invoice.raw.taxes) {
        await client.query(
          `insert into public.dte_taxes (
             tenant_id, dte_document_id, dte_item_id, tipo_imp, tasa_imp, monto_imp, raw_json
           ) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [
            document.tenant_id,
            document.id,
            tax.lineNumber ? itemIds.get(tax.lineNumber) ?? null : null,
            tax.tipoImp,
            tax.tasaImp,
            tax.montoImp,
            JSON.stringify(tax.raw)
          ]
        );
        if (tax.lineNumber) {
          summary.itemTaxes += 1;
        }
      }

      for (const discount of invoice.raw.globalDiscounts) {
        await client.query(
          `insert into public.dte_global_discounts (
             tenant_id, dte_document_id, line_number, movement_type, description, value_type,
             value, other_currency_value, exempt_indicator, raw_json
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [
            document.tenant_id,
            document.id,
            discount.lineNumber,
            discount.movementType,
            discount.description,
            discount.valueType,
            discount.value,
            discount.otherCurrencyValue,
            discount.exemptIndicator,
            JSON.stringify(discount.raw)
          ]
        );
      }
      await client.query(
        `insert into public.audit_events (tenant_id, entity_type, entity_id, event_type, after_data)
          values ($1,'dte_document',$2,'dte.xml_reparsed',$3::jsonb)`,
        [
          document.tenant_id,
          document.id,
          JSON.stringify({ folio: invoice.folio, items: invoice.items.length, parser_version: "dte-parser-v3" })
        ]
      );
      await client.query("commit");
      summary.documents += 1;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      summary.rejected += 1;
      console.error(`rejected ${document.tipo_dte}-${document.folio}: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  if (!dryRun) {
    const orphanItems = await client.query(
      `select i.id, i.tenant_id, i.name, i.description, i.item_description_raw, i.unit,
              i.unit_price, d.supplier_id, d.fecha_emision
         from public.dte_items i
         join public.dte_documents d on d.id = i.dte_document_id
        where i.product_id is null
          and d.supplier_id is not null
          and coalesce(nullif(i.name, ''), nullif(i.description, '')) is not null`
    );
    for (const orphan of orphanItems.rows as OrphanItemRow[]) {
      const name = productName(orphan.name ?? orphan.description);
      if (/^(?:\d+(?:[.,]\d+)?\s*)?(?:caja|unidad|un)$/i.test(name)) {
        continue;
      }
      const upsertedProduct = await client.query(
        `insert into public.products (tenant_id, name, description, unit, status)
           values ($1,$2,$3,$4,'active')
         on conflict (tenant_id, name)
           do update set description = coalesce(public.products.description, excluded.description),
                         updated_at = now()
         returning id`,
        [
          orphan.tenant_id,
          name,
          orphan.item_description_raw ?? orphan.description,
          orphan.unit ?? "unidad"
        ]
      );
      const productId = upsertedProduct.rows[0].id as string;
      await client.query("update public.dte_items set product_id = $2 where id = $1", [orphan.id, productId]);
      await client.query(
        `insert into public.product_supplier_links (
           tenant_id, product_id, supplier_id, last_purchase_price, last_purchase_at
         ) values ($1,$2,$3,$4,$5)
         on conflict (tenant_id, product_id, supplier_id)
           do update set last_purchase_price = excluded.last_purchase_price,
                         last_purchase_at = excluded.last_purchase_at,
                         updated_at = now()`,
        [orphan.tenant_id, productId, orphan.supplier_id, orphan.unit_price, orphan.fecha_emision]
      );
      summary.products += 1;
    }
  }

  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
} finally {
  await client.end();
}
