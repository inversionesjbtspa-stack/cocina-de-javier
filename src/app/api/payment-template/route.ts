import { NextResponse } from "next/server";
import { repairPaymentSuppliers } from "@/lib/payments/repair-suppliers";
import { generateSantanderTemplate, generateSantanderTemplateFromPayables } from "@/lib/payments/santander-template";
import { createClient } from "@/lib/supabase/server";

type InvalidExport = {
  alerts: string[];
  bankCode: string;
  bankName: string;
  folio: string;
  id: string;
  proveedor: string;
  rut: string;
  supplierId: string;
};

function errorCsv(rows: InvalidExport[]) {
  const escape = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    ["folio", "proveedor", "rut", "banco", "codigo_banco", "dato_faltante", "accion_recomendada", "ficha_proveedor"],
    ...rows.map((row) => [
      row.folio,
      row.proveedor,
      row.rut,
      row.bankName,
      row.bankCode,
      row.alerts.join(", "),
      "Completar ficha proveedor antes de exportar Santander",
      row.supplierId ? `/proveedores?supplier=${row.supplierId}` : "/proveedores"
    ])
  ].map((row) => row.map(escape).join(";")).join("\n");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const treasuryRequest = request.headers.get("x-erp-request") === "treasury";
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    if (!treasuryRequest) return NextResponse.redirect(new URL("/login?error=session-required", url));
    return NextResponse.json({ ok: false, error: "unauthorized", invalid: [] }, { status: 401 });
  }
  const membership = await auth.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership.data || !["owner", "admin", "finance_manager"].includes(membership.data.role)) {
    return NextResponse.json({ ok: false, error: "forbidden", invalid: [] }, { status: 403 });
  }
  const payableIds = url.searchParams.get("payableIds")?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  const folios = url.searchParams
    .get("folios")
    ?.split(",")
    .map((folio) => folio.trim())
    .filter(Boolean) ?? [];

  if (payableIds.length) {
    await repairPaymentSuppliers({
      companyId: membership.data.company_id,
      role: membership.data.role,
      tenantId: membership.data.tenant_id,
      userId: user.id
    });
  }
  const result = payableIds.length ? await generateSantanderTemplateFromPayables(payableIds, url.searchParams.get("payDate") ?? undefined) : generateSantanderTemplate(folios);
  const invalid = result.invalid.map((item) => ({
    alerts: item.alerts,
    bankCode: "invoice" in item ? "" : item.bankCode,
    bankName: "invoice" in item ? "" : item.bankName,
    folio: "invoice" in item ? item.invoice.folio : item.folio,
    id: "invoice" in item ? item.invoice.folio : item.id,
    proveedor: "invoice" in item ? item.invoice.razonSocialEmisor : item.supplierName,
    rut: "invoice" in item ? item.invoice.rutEmisor : item.supplierRut,
    supplierId: "invoice" in item ? "" : item.supplierId
  }));

  if (!result.ok) {
    if (!treasuryRequest) {
      return new NextResponse(errorCsv(invalid), {
        headers: {
          "Content-Disposition": 'attachment; filename="Errores nomina Santander.csv"',
          "Content-Type": "text/csv; charset=utf-8",
          "X-Payment-Validation": "failed"
        },
        status: 200
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: "payment_validation_failed",
        invalid
      },
      { status: 422 }
    );
  }

  return new NextResponse(result.buffer, {
    headers: {
      "Content-Disposition": 'attachment; filename="Template Pagos JESUS - nomina ERP.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Payment-Excluded": String(invalid.length),
      "X-Payment-Rows": String(result.rows.length)
    }
  });
}
