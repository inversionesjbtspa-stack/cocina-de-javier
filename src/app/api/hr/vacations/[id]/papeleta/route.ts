import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function esc(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function line(y: number, label: string, value: string) {
  return `0.18 0.10 0.12 rg BT /F1 10 Tf 56 ${y} Td (${esc(label)}: ${esc(value || "No informado")}) Tj ET`;
}

function generatePapeletaPdf(data: {
  fullName: string;
  rut: string;
  position: string | null;
  hireDate: string | null;
  startDate: string;
  endDate: string;
  businessDays: number;
  previousBalance: number;
  resultingBalance: number;
}) {
  const content = [
    "0.43 0.09 0.16 rg 0 760 612 82 re f",
    "1 1 1 rg BT /F2 18 Tf 56 808 Td (LA COCINA DE JAVIER) Tj ET",
    "0.96 0.90 0.86 rg BT /F1 10 Tf 56 786 Td (Papeleta de vacaciones) Tj ET",
    "0.995 0.985 0.965 rg 42 610 528 110 re f",
    "0.43 0.09 0.16 rg BT /F2 14 Tf 56 690 Td (Solicitud / comprobante de feriado legal) Tj ET",
    line(660, "Trabajador", data.fullName),
    line(642, "RUT", data.rut),
    line(624, "Cargo", data.position ?? ""),
    line(606, "Fecha ingreso", data.hireDate ?? ""),
    "0.995 0.985 0.965 rg 42 420 528 150 re f",
    line(540, "Fecha inicio", data.startDate),
    line(522, "Fecha termino", data.endDate),
    line(504, "Dias habiles solicitados", String(data.businessDays)),
    line(486, "Saldo anterior", String(data.previousBalance)),
    line(468, "Saldo posterior", String(data.resultingBalance)),
    line(450, "Observacion", "Documento generado desde ERP RRHH"),
    "0.78 0.68 0.62 RG 0.8 w 70 250 m 250 250 l S",
    "0.78 0.68 0.62 RG 0.8 w 360 250 m 540 250 l S",
    "0.18 0.10 0.12 rg BT /F1 9 Tf 105 232 Td (Firma trabajador) Tj ET",
    "0.18 0.10 0.12 rg BT /F1 9 Tf 395 232 Td (Firma empleador) Tj ET",
    `0.45 0.37 0.35 rg BT /F1 8 Tf 56 84 Td (Generado: ${new Date().toISOString().slice(0, 10)}) Tj ET`
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
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
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("hr_vacation_requests")
    .select("id,start_date,end_date,business_days,previous_balance,resulting_balance,hr_employees(id,full_name,rut,position,hire_date)")
    .eq("tenant_id", ctx.membership.tenant_id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  const employee = Array.isArray(data.hr_employees) ? data.hr_employees[0] : data.hr_employees;
  await supabase.from("hr_vacation_documents").insert({
    document_type: "papeleta",
    employee_id: employee?.id,
    generated_by: ctx.user.id,
    tenant_id: ctx.membership.tenant_id,
    vacation_request_id: id
  });
  await supabase.from("audit_events").insert({ actor_role: ctx.membership.role, actor_user_id: ctx.user.id, company_id: ctx.membership.company_id, entity_id: id, entity_type: "hr_vacation_request", event_type: "hr.vacation_papeleta_generated", tenant_id: ctx.membership.tenant_id });
  return new NextResponse(generatePapeletaPdf({
    businessDays: Number(data.business_days ?? 0),
    endDate: data.end_date,
    fullName: employee?.full_name ?? "Trabajador",
    hireDate: employee?.hire_date ?? null,
    position: employee?.position ?? null,
    previousBalance: Number(data.previous_balance ?? 0),
    resultingBalance: Number(data.resulting_balance ?? 0),
    rut: employee?.rut ?? "",
    startDate: data.start_date
  }), {
    headers: {
      "Content-Disposition": `inline; filename="papeleta-vacaciones-${id}.pdf"`,
      "Content-Type": "application/pdf"
    }
  });
}
