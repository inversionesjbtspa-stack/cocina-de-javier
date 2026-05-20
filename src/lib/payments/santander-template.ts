import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { purchasesData, type DtePurchaseInvoice } from "@/lib/dte/purchases-data";
import { paymentValidation } from "@/lib/suppliers/master";

const templatePath = path.join(process.cwd(), "src", "templates", "template-pagos-jesus.xlsx");

type PaymentRow = {
  invoice: DtePurchaseInvoice;
  supplier: NonNullable<ReturnType<typeof paymentValidation>["supplier"]>;
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

function rowXml(index: number, row: PaymentRow) {
  const amount = Math.round(row.invoice.montoTotal);
  const folio = row.invoice.folio;
  const glosa = `FACT ${folio}`;

  return `<row r="${index}" spans="1:18">` +
    textCell(`A${index}`, "71068862") +
    textCell(`B${index}`, "CLP") +
    textCell(`C${index}`, row.supplier.bankAccount) +
    textCell(`D${index}`, "CLP") +
    textCell(`E${index}`, row.supplier.bankCode) +
    textCell(`F${index}`, row.supplier.rut) +
    textCell(`G${index}`, row.supplier.businessName) +
    numberCell(`H${index}`, amount) +
    textCell(`I${index}`, glosa) +
    textCell(`J${index}`, row.supplier.email) +
    textCell(`K${index}`, glosa) +
    textCell(`L${index}`, glosa) +
    textCell(`M${index}`, `${glosa} J. PASCUAL Y FAMILIA SPA`) +
    textCell(`P${index}`, row.supplier.code) +
    textCell(`Q${index}`, folio) +
    numberCell(`R${index}`, amount) +
    "</row>";
}

function sheetDataWithRows(sheetXml: string, rows: PaymentRow[]) {
  const headerMatch = sheetXml.match(/<row[^>]*r="1"[\s\S]*?<\/row>/);
  if (!headerMatch) {
    throw new Error("Template Santander no tiene fila de encabezados.");
  }

  const bodyRows = rows.map((row, index) => rowXml(index + 2, row)).join("");
  return sheetXml
    .replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:R${rows.length + 1}"/>`)
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${headerMatch[0]}${bodyRows}</sheetData>`);
}

export function selectedInvoicesFromFolios(folios: string[]) {
  const selected = folios.length
    ? purchasesData.invoices.filter((invoice) => folios.includes(invoice.folio))
    : purchasesData.invoices.filter((invoice) => invoice.tipoDte !== "61").slice(0, 50);

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
