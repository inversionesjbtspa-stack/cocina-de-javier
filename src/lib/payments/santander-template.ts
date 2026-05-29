import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { purchasesData, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";
import { paymentValidation } from "@/lib/suppliers/master";
import { createAdminClient } from "@/lib/supabase/admin";

const templatePath = path.join(process.cwd(), "src", "templates", "template-pagos-jesus.xlsx");

type PaymentRow = {
  invoice: DtePurchaseInvoice;
  supplier: NonNullable<ReturnType<typeof paymentValidation>["supplier"]>;
};
type SupabasePaymentRow = {
  payableId: string;
  amount: number;
  folio: string;
  glosa?: string;
  invoiceSupplier?: { businessName: string; rut: string };
  paymentBeneficiarySource?: "assigned" | "supplier";
  supplier: { bankAccount: string; bankCode: string; businessName: string; code: string; email: string; rut: string };
};
export type SantanderBankPaymentRow = SupabasePaymentRow;
export type InvalidPayablePayment = {
  id: string;
  folio: string;
  bankName: string;
  bankCode: string;
  supplierId: string;
  supplierName: string;
  supplierRut: string;
  alerts: string[];
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textCell(ref: string, value: string) {
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number) {
  return `<c r="${ref}"><v>${Math.round(value)}</v></c>`;
}

function columnStyle(sheetXml: string, column: string) {
  return sheetXml.match(new RegExp(`<c r="${column}2"([^>]*)>`))?.[1]?.match(/\ss="[^"]+"/)?.[0] ?? "";
}

function styledTextCell(ref: string, value: string, style = "") {
  return `<c r="${ref}"${style} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function styledNumberCell(ref: string, value: number, style = "") {
  return `<c r="${ref}"${style}><v>${Math.round(value)}</v></c>`;
}

function rowXml(index: number, row: PaymentRow | SupabasePaymentRow, sheetXml?: string) {
  const amount = Math.round("invoice" in row ? row.invoice.montoTotal : row.amount);
  const folio = "invoice" in row ? row.invoice.folio : row.folio;
  const glosa = "invoice" in row ? `FACT ${folio}` : row.glosa || `PAGO ${folio}`;
  const text = (column: string, value: string) =>
    sheetXml ? styledTextCell(`${column}${index}`, value, columnStyle(sheetXml, column)) : textCell(`${column}${index}`, value);
  const number = (column: string, value: number) =>
    sheetXml ? styledNumberCell(`${column}${index}`, value, columnStyle(sheetXml, column)) : numberCell(`${column}${index}`, value);

  return `<row r="${index}" spans="1:18">` +
    text("A", "71068862") +
    text("B", "CLP") +
    text("C", row.supplier.bankAccount) +
    text("D", "CLP") +
    text("E", row.supplier.bankCode) +
    text("F", row.supplier.rut) +
    text("G", row.supplier.businessName) +
    number("H", amount) +
    text("I", glosa) +
    text("J", row.supplier.email) +
    text("K", glosa) +
    text("L", glosa) +
    text("M", `${glosa} J. PASCUAL Y FAMILIA SPA`) +
    text("N", "") +
    text("O", "") +
    text("P", row.supplier.code) +
    text("Q", folio) +
    number("R", amount) +
    "</row>";
}

export function generateSantanderTemplateFromRows(rows: SantanderBankPaymentRow[]) {
  if (!fs.existsSync(templatePath)) throw new Error("Template Pagos JESUS.xlsx no existe en el proyecto.");
  const zip = new AdmZip(templatePath);
  const entry = zip.getEntry("xl/worksheets/sheet1.xml");
  if (!entry) throw new Error("Template Santander no contiene xl/worksheets/sheet1.xml.");
  zip.updateFile("xl/worksheets/sheet1.xml", Buffer.from(sheetDataWithRows(entry.getData().toString("utf8"), rows), "utf8"));
  return zip.toBuffer();
}

function sheetDataWithRows(sheetXml: string, rows: Array<PaymentRow | SupabasePaymentRow>) {
  const headerMatch = sheetXml.match(/<row[^>]*r="1"[\s\S]*?<\/row>/);
  if (!headerMatch) {
    throw new Error("Template Santander no tiene fila de encabezados.");
  }

  const bodyRows = rows.map((row, index) => rowXml(index + 2, row, sheetXml)).join("");
  return sheetXml
    .replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:R${rows.length + 1}"/>`)
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${headerMatch[0]}${bodyRows}</sheetData>`);
}

export function selectedInvoicesFromFolios(folios: string[]) {
  const selected = folios.length
    ? purchasesData.invoices.filter((invoice) => folios.includes(invoice.folio))
    : [];

  if (selected.length === 0) {
    return {
      invalid: [
        {
          alerts: ["No hay facturas seleccionadas validas"],
          invoice: purchasesData.invoices[0],
          ok: false,
          supplier: null
        }
      ],
      ok: false as const,
      rows: []
    };
  }

  const validations = selected.map(paymentValidation);
  const invalid = validations.filter((item) => !item.ok);

  if (invalid.length) {
    return {
      invalid,
      ok: false as const,
      rows: []
    };
  }

  return {
    invalid: [],
    ok: true as const,
    rows: validations.map((item) => ({
      invoice: item.invoice,
      supplier: item.supplier!
    }))
  };
}

export function generateSantanderTemplate(folios: string[]) {
  if (!fs.existsSync(templatePath)) {
    throw new Error("Template Pagos JESUS.xlsx no existe en el proyecto.");
  }

  const selection = selectedInvoicesFromFolios(folios);
  if (!selection.ok) {
    return selection;
  }

  const zip = new AdmZip(templatePath);
  const entry = zip.getEntry("xl/worksheets/sheet1.xml");
  if (!entry) {
    throw new Error("Template Santander no contiene xl/worksheets/sheet1.xml.");
  }

  const sheetXml = entry.getData().toString("utf8");
  zip.updateFile("xl/worksheets/sheet1.xml", Buffer.from(sheetDataWithRows(sheetXml, selection.rows), "utf8"));

  return {
    buffer: zip.toBuffer(),
    invalid: [],
    ok: true as const,
    rows: selection.rows
  };
}

export async function generateSantanderTemplateFromPayables(payableIds: string[], payDate?: string) {
  if (!fs.existsSync(templatePath)) throw new Error("Template Pagos JESUS.xlsx no existe en el proyecto.");
  const supabase = createAdminClient();
  const [{ data }, { data: activeBatchItems }] = await Promise.all([
    supabase.from("accounts_payable").select("id,tenant_id,company_id,document_number,balance_amount,status,supplier_id,suppliers(id,rut,legal_name,email,payment_email,status,supplier_bank_accounts(bank_name,bank_code,bank_mapping_needs_review,account_type,account_number,account_holder_name,account_holder_rut,status))").in("id", payableIds),
    supabase.from("payment_batch_items").select("accounts_payable_id,payment_batches(status)").in("accounts_payable_id", payableIds)
  ]);
  const activeBatchPayables = new Set((activeBatchItems ?? []).filter((item) => {
    const batch = Array.isArray(item.payment_batches) ? item.payment_batches[0] : item.payment_batches;
    return batch && batch.status !== "cancelled" && batch.status !== "reconciled";
  }).map((item) => item.accounts_payable_id));
  const assignedBeneficiaries = await getAssignedPaymentBeneficiaries(
    Array.from(new Set((data ?? []).map((item) => item.supplier_id).filter(Boolean))) as string[],
    supabase
  );
  const invalid: InvalidPayablePayment[] = [];
  const rows: SupabasePaymentRow[] = [];
  for (const item of data ?? []) {
    type SupplierRow = { id: string; rut: string; legal_name: string; email: string | null; payment_email: string | null; status: string; supplier_bank_accounts?: Array<{ bank_name: string; bank_code: string | null; bank_mapping_needs_review: boolean; account_type: string; account_number: string; account_holder_name: string | null; account_holder_rut: string | null; status: string }> };
    const supplier = (Array.isArray(item.suppliers) ? item.suppliers[0] : item.suppliers) as SupplierRow;
    const bank = supplier.supplier_bank_accounts?.find((account) => account.status !== "disabled");
    const assignment = assignedBeneficiaries.get(supplier.id);
    const payee = assignment
      ? {
        accountNumber: String(assignment.account_number ?? ""),
        accountType: String(assignment.account_type ?? ""),
        bankCode: String(assignment.bank_code ?? ""),
        bankName: String(assignment.bank_name ?? ""),
        businessName: String(assignment.name ?? ""),
        email: String(assignment.payment_email ?? ""),
        mappingNeedsReview: false,
        rut: String(assignment.rut ?? ""),
        source: "assigned" as const,
        status: String(assignment.status ?? "")
      }
      : {
        accountNumber: bank?.account_number ?? "",
        accountType: bank?.account_type ?? "",
        bankCode: bank?.bank_code ?? "",
        bankName: bank?.bank_name ?? "",
        businessName: bank?.account_holder_name || supplier.legal_name,
        email: supplier.payment_email ?? supplier.email ?? "",
        mappingNeedsReview: Boolean(bank?.bank_mapping_needs_review),
        rut: bank?.account_holder_rut || supplier.rut,
        source: "supplier" as const,
        status: "active"
      };
    const alerts = [];
    if (!supplier?.rut) alerts.push("RUT");
    if (!supplier?.legal_name) alerts.push("razon social");
    if (!payee.bankName) alerts.push("banco");
    if (!payee.bankCode) alerts.push("codigo banco");
    if (payee.mappingNeedsReview) alerts.push("banco en revision");
    if (!payee.accountType) alerts.push("tipo cuenta");
    if (!payee.accountNumber) alerts.push("cuenta");
    if (!payee.email) alerts.push("email");
    if (payee.source === "assigned" && payee.status !== "active") alerts.push("beneficiario inactivo");
    if (Number(item.balance_amount ?? 0) <= 0) alerts.push("saldo");
    if (item.status === "paid") alerts.push("pagada");
    if (supplier.status === "blocked") alerts.push("proveedor bloqueado");
    if (activeBatchPayables.has(item.id)) alerts.push("ya esta en nomina activa");
    if (alerts.length || (!bank && !assignment)) { invalid.push({ alerts, bankCode: payee.bankCode, bankName: payee.bankName, folio: item.document_number, id: item.id, supplierId: supplier.id, supplierName: supplier.legal_name || "Proveedor sin razon social", supplierRut: supplier.rut || "" }); continue; }
    rows.push({
      amount: Number(item.balance_amount),
      folio: String(item.document_number).replace(/^\d+-/, ""),
      invoiceSupplier: { businessName: supplier.legal_name, rut: supplier.rut },
      paymentBeneficiarySource: payee.source,
      payableId: item.id,
      supplier: { bankAccount: payee.accountNumber, bankCode: payee.bankCode, businessName: payee.businessName, code: "", email: payee.email, rut: payee.rut }
    });
  }
  if (!rows.length) return { invalid, ok: false as const, rows: [] };
  const zip = new AdmZip(templatePath);
  const entry = zip.getEntry("xl/worksheets/sheet1.xml");
  if (!entry) throw new Error("Template Santander no contiene xl/worksheets/sheet1.xml.");
  zip.updateFile("xl/worksheets/sheet1.xml", Buffer.from(sheetDataWithRows(entry.getData().toString("utf8"), rows), "utf8"));
  const payableIdsToUpdate = rows.map((row) => row.payableId);
  const scheduledAt = new Date().toISOString();
  const richUpdate = await supabase
    .from("accounts_payable")
    .update({ included_in_batch_at: scheduledAt, payment_status: "in_batch", status: "scheduled" })
    .in("id", payableIdsToUpdate);
  if (richUpdate.error) {
    await supabase.from("accounts_payable").update({ status: "scheduled" }).in("id", payableIdsToUpdate);
  }
  const first = (data ?? [])[0];
  await supabase.from("audit_events").insert({
    after_data: {
      accounts_payable_ids: rows.map((row) => row.payableId),
      count: rows.length,
      pay_date: payDate ?? null,
      payments: rows.map((row) => ({
        amount: row.amount,
        bank_account: row.supplier.bankAccount,
        beneficiario_pago: row.supplier.businessName,
        cuenta_destino: row.supplier.bankAccount,
        document_number: row.folio,
        folio: row.folio,
        monto: row.amount,
        payment_beneficiary_name: row.supplier.businessName,
        payment_beneficiary_rut: row.supplier.rut,
        payment_beneficiary_source: row.paymentBeneficiarySource ?? "supplier",
        proveedor_facturador: row.invoiceSupplier?.businessName ?? row.supplier.businessName,
        rut_beneficiario_pago: row.supplier.rut,
        rut_facturador: row.invoiceSupplier?.rut ?? row.supplier.rut,
        supplier_name: row.invoiceSupplier?.businessName ?? row.supplier.businessName,
        supplier_rut: row.invoiceSupplier?.rut ?? row.supplier.rut
      }))
    },
    company_id: first?.company_id,
    entity_type: "payment_nomina",
    event_type: "payment.santander_exported",
    tenant_id: first?.tenant_id
  });
  return { buffer: zip.toBuffer(), invalid, ok: true as const, rows };
}

async function getAssignedPaymentBeneficiaries(
  supplierIds: string[],
  supabase: ReturnType<typeof createAdminClient>
) {
  const result = new Map<string, Record<string, unknown>>();
  if (!supplierIds.length) return result;
  const { data, error } = await supabase
    .from("supplier_payment_beneficiary_links")
    .select("supplier_id,payment_beneficiaries(id,name,rut,bank_name,bank_code,account_type,account_number,payment_email,status)")
    .in("supplier_id", supplierIds)
    .eq("is_active", true)
    .limit(1000);
  if (error) return result;
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const beneficiary = Array.isArray(row.payment_beneficiaries) ? row.payment_beneficiaries[0] : row.payment_beneficiaries;
    if (beneficiary && typeof row.supplier_id === "string") result.set(row.supplier_id, beneficiary as Record<string, unknown>);
  }
  return result;
}
