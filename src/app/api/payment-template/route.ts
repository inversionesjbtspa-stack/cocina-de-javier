import { NextResponse } from "next/server";
import { purchasesData } from "@/lib/dte/purchases-data";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function GET() {
  const rows = [
    [
      "Rut Empresa",
      "",
      "Banco",
      "",
      "Cuenta",
      "Tipo",
      "Rut Proveedor",
      "Monto",
      "Glosa",
      "Email",
      "Documento",
      "Referencia",
      "Detalle",
      "",
      "",
      "Rut/Proveedor",
      "Factura",
      "Monto"
    ],
    ...purchasesData.invoices
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
        String(Math.round(invoice.montoTotal)),
        `FACT ${invoice.folio}`,
        "",
        invoice.folio,
        "",
        `FACT ${invoice.folio} J. PASCUAL Y FAMILIA SPA`,
        "",
        "",
        invoice.razonSocialEmisor,
        invoice.folio,
        String(Math.round(invoice.montoTotal))
      ])
  ];

  const xmlRows = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`)
          .join("")}</Row>`
    )
    .join("");
  const workbook = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Pagos">
  <Table>${xmlRows}</Table>
 </Worksheet>
</Workbook>`;

  return new NextResponse(workbook, {
    headers: {
      "Content-Disposition": 'attachment; filename="pagos-masivos-santander.xls"',
      "Content-Type": "application/vnd.ms-excel"
    }
  });
}
