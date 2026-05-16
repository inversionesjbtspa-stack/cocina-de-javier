import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = 4173;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel"
};

function formatClp(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

async function loadDteData() {
  try {
    const data = await readFile(join(root, "preview", "dte-purchases-2026.json"), "utf8");
    return JSON.parse(data);
  } catch {
    return { invoices: [] };
  }
}

function toPdfInvoice(invoice) {
  return {
    title: `${invoice.documentType} ${invoice.folio}`,
    date: invoice.fechaEmision,
    supplier: invoice.razonSocialEmisor,
    rut: invoice.rutEmisor,
    receiver: invoice.razonSocialReceptor,
    receiverRut: invoice.rutReceptor,
    net: formatClp(invoice.montoNeto),
    iva: formatClp(invoice.iva),
    amount: formatClp(invoice.montoTotal),
    items: (invoice.items ?? []).map((item) => [
      item.description,
      Number(item.quantity || 0).toLocaleString("es-CL"),
      formatClp(item.unitPrice),
      formatClp(item.lineTotal)
    ])
  };
}

function pdfEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function generateInvoicePdf(invoice) {
  const lines = [
    "LA COCINA DE JAVIER",
    "REPRESENTACION PDF DESDE XML DTE",
    invoice.title,
    `Fecha: ${invoice.date}`,
    `Proveedor: ${invoice.supplier}`,
    `RUT: ${invoice.rut}`,
    "Condicion de pago: 30 dias",
    `Receptor: ${invoice.receiver ?? "J PASCUAL Y FAMILIA SPA"}`,
    `RUT receptor: ${invoice.receiverRut ?? "79939910-5"}`,
    `Neto: ${invoice.net ?? "-"}`,
    `IVA: ${invoice.iva ?? "-"}`,
    `Monto total: ${invoice.amount}`,
    "",
    "Detalle:",
    ...invoice.items.map(
      ([name, quantity, price, total]) =>
        `${name} | Cantidad: ${quantity} | Precio: ${price} | Total: ${total}`
    )
  ];
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "/F1 16 Tf" : "/F1 11 Tf",
      `(${pdfEscape(line)}) Tj`,
      "0 -22 Td"
    ]),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf);
}

function generatePaymentExcel(invoices) {
  const rows = [
    ["Rut Empresa", "", "Banco", "", "Cuenta", "Tipo", "Rut Proveedor", "Monto", "Glosa", "Email", "Documento", "Referencia", "Detalle", "", "", "Rut/Proveedor", "Factura", "Monto"],
    ...invoices
      .filter((invoice) => invoice.tipoDte !== "61")
      .slice(0, 200)
      .map((invoice) => [
        "71068862",
        "",
        "",
        "",
        "",
        "",
        invoice.rutEmisor,
        String(Math.round(Number(invoice.montoTotal || 0))),
        `FACT ${invoice.folio}`,
        "",
        invoice.folio,
        "",
        `FACT ${invoice.folio} J. PASCUAL Y FAMILIA SPA`,
        "",
        "",
        invoice.razonSocialEmisor,
        invoice.folio,
        String(Math.round(Number(invoice.montoTotal || 0)))
      ])
  ];
  const xmlRows = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${String(cell).replace(/&/g, "&amp;")}</Data></Cell>`)
          .join("")}</Row>`
    )
    .join("");

  return Buffer.from(`<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Pagos">
  <Table>${xmlRows}</Table>
 </Worksheet>
</Workbook>`);
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/invoice-pdf") {
      const dteData = await loadDteData();
      const invoice = dteData.invoices.find(
        (candidate) => candidate.folio === (url.searchParams.get("folio") ?? "")
      );

      if (!invoice) {
        response.writeHead(404);
        response.end("Invoice not found");
        return;
      }

      const disposition =
        url.searchParams.get("download") === "1" ? "attachment" : "inline";
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${invoice.documentType}-${invoice.folio}.pdf"`
      });
      response.end(generateInvoicePdf(toPdfInvoice(invoice)));
      return;
    }

    if (url.pathname === "/api/payment-template") {
      const dteData = await loadDteData();
      response.writeHead(200, {
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": 'attachment; filename="pagos-masivos-santander.xls"'
      });
      response.end(generatePaymentExcel(dteData.invoices));
      return;
    }

    let filePath = normalize(join(root, decodeURIComponent(url.pathname)));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, "index.html");
    }

    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream"
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Preview server running at http://127.0.0.1:${port}`);
});
