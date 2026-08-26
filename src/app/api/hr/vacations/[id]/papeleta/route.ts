import { NextResponse } from "next/server";
import { companyConfigFromRow, mergeCompanyConfig } from "@/lib/hr/company-config";
import { requireHrContext } from "@/lib/hr/auth";
import { buildVacationReceiptModel, renderVacationReceiptHtml, renderVacationReceiptPdf, vacationReceiptHash } from "@/lib/hr/vacation-receipt";
import { fetchVacationReceiptAllocations } from "@/lib/hr/vacation-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const supabase = createAdminClient();
  const [{ data }, company, receiptAllocations] = await Promise.all([
    supabase
      .from("hr_vacation_requests")
      .select("*,hr_employees(id,full_name,rut,position,area,cost_center,hire_date,contract_type)")
      .eq("tenant_id", ctx.membership.tenant_id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("legal_name,name,rut,address,phone")
      .eq("id", ctx.membership.company_id)
      .maybeSingle(),
    fetchVacationReceiptAllocations(supabase, ctx.membership.tenant_id, id)
  ]);

  if (!data) return NextResponse.json({ ok: false, error: "vacation_not_found" }, { status: 404 });
  const snapshot = data.receipt_snapshot ?? data.snapshot;
  const snapshotEmployee = snapshot?.employee as Record<string, string | null> | undefined;
  const snapshotCompany = snapshot?.company;
  const companyConfig = mergeCompanyConfig(companyConfigFromRow(company.data), snapshotCompany ? companyConfigFromRow(snapshotCompany) : companyConfigFromRow(null));
  const employee = firstRelation(data.hr_employees as Array<Record<string, string | null>> | Record<string, string | null> | null);
  const allocations = receiptAllocations.length ? receiptAllocations : snapshot?.allocations ?? data.vacation_allocations ?? [];
  const firstAllocation = allocations[0];
  const model = buildVacationReceiptModel({
    allocations,
    approvedByName: data.approved_by_name ?? null,
    businessDays: Number(data.business_days ?? snapshot?.business_days ?? 0),
    company: companyConfig,
    contractPeriodEnd: data.contract_period_end ?? firstAllocation?.periodEnd ?? null,
    contractPeriodStart: data.contract_period_start ?? firstAllocation?.periodStart ?? null,
    documentDate: data.document_date ?? null,
    employee: {
      area: snapshotEmployee?.area ?? employee?.area ?? null,
      contractType: snapshotEmployee?.contractType ?? employee?.contract_type ?? null,
      costCenter: snapshotEmployee?.costCenter ?? employee?.cost_center ?? null,
      fullName: snapshotEmployee?.fullName ?? employee?.full_name ?? "Trabajador",
      hireDate: snapshotEmployee?.hireDate ?? employee?.hire_date ?? null,
      id: snapshotEmployee?.id ?? employee?.id ?? null,
      position: snapshotEmployee?.position ?? employee?.position ?? null,
      rut: snapshotEmployee?.rut ?? employee?.rut ?? ""
    },
    endDate: data.effective_rest_end_date ?? data.end_date,
    fractionalVacation: data.fractional_vacation ?? null,
    id,
    nonBusinessDays: data.non_business_days ?? null,
    note: data.note ?? null,
    previousBalance: Number(data.previous_balance ?? 0),
    progressiveDays: Number(data.progressive_days ?? 0),
    projectedProportional: Number(snapshot?.projected_proportional ?? data.projected_business_days ?? 0),
    receiptNumber: data.document_number ?? data.receipt_number ?? null,
    returnToWorkDate: data.return_to_work_date ?? snapshot?.return?.return_to_work_date ?? null,
    requestedStatus: data.status ?? null,
    resultingBalance: Number(data.resulting_balance ?? 0),
    startDate: data.start_date
  });

  if (format === "html" || format === "preview") {
    return new NextResponse(renderVacationReceiptHtml(model), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  }

  const pdf = renderVacationReceiptPdf(model);
  if (url.searchParams.get("persist") === "1" && data.status === "aprobada") {
    const storagePath = `tenants/${ctx.membership.tenant_id}/employees/${employee?.id ?? "sin-empleado"}/vacations/${id}/${model.receiptNumber ?? "sin-correlativo"}.pdf`;
    const upload = await supabase.storage.from("hr-vacation-documents").upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true
    });
    if (!upload.error) {
      await supabase.from("hr_vacation_documents").upsert({
        document_status: data.receipt_status ?? "vigente",
        document_type: "comprobante_feriado",
        employee_id: employee?.id,
        file_size: pdf.byteLength,
        mime_type: "application/pdf",
        file_name: model.filename,
        file_sha256: vacationReceiptHash(pdf),
        generated_by: ctx.user.id,
        immutable_snapshot: model,
        storage_bucket: "hr-vacation-documents",
        storage_path: storagePath,
        tenant_id: ctx.membership.tenant_id,
        vacation_request_id: id
      }, { onConflict: "tenant_id,vacation_request_id,document_type" });
    }
  }
  return new NextResponse(pdf, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${model.filename}"`,
      "Content-Type": "application/pdf",
      "X-HR-Vacation-Receipt": model.receiptNumber
    }
  });
}
