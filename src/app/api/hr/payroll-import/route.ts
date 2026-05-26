import { NextResponse } from "next/server";
import { requireHrContext } from "@/lib/hr/auth";
import { normalizeRut } from "@/lib/hr/utils";
import {
  extractPayslipsFromPdf,
  generatePayslipPdf,
  parseAccountantWorkbook,
  type ParsedPayslip
} from "@/lib/hr/payroll-parser";
import { createAdminClient } from "@/lib/supabase/admin";

function componentRows(payslip: ParsedPayslip, tenantId: string, employeeId: string, payslipId: string, userId: string) {
  const rows = [
    ["sueldo_base", "Sueldo base", payslip.baseSalary],
    ["bono_produccion", "Bono produccion", payslip.productionBonus],
    ["bono_responsabilidad", "Bono responsabilidad", payslip.responsibilityBonus],
    ["bono_compensatorio", "Bono compensatorio", payslip.compensatoryBonus],
    ["horas_extra", "Horas extra", payslip.overtime],
    ["recargo_domingo", "Recargo domingos", payslip.sundaySurcharge],
    ["anticipo", "Anticipos", payslip.advances],
    ["descuento_ccaf", "Descuentos CCAF", payslip.ccafDiscount],
    ["impuesto_unico", "Impuesto unico", payslip.uniqueTax],
    ["salud_adicional", "Salud adicional", payslip.additionalHealth]
  ] as const;
  return rows.filter(([, , amount]) => amount > 0).map(([componentType, label, amount]) => ({
    amount,
    component_type: componentType,
    created_by: userId,
    employee_id: employeeId,
    label,
    payslip_id: payslipId,
    period: payslip.period,
    raw_text: payslip.rawText,
    source: "payslip_pdf",
    tenant_id: tenantId
  }));
}

export async function POST(request: Request) {
  const ctx = await requireHrContext();
  if (ctx.error) return ctx.error;
  const form = await request.formData();
  const pdfFile = form.get("payslipsPdf");
  const xlsxFile = form.get("salaryDataXlsx");
  const period = String(form.get("period") ?? "2026-04");
  if (!(pdfFile instanceof File)) return NextResponse.json({ ok: false, error: "payslips_pdf_required" }, { status: 422 });
  const supabase = createAdminClient();
  const payslips = extractPayslipsFromPdf(Buffer.from(await pdfFile.arrayBuffer()));
  const warnings: string[] = [];
  let createdEmployees = 0;
  let updatedEmployees = 0;
  let payslipsSaved = 0;
  let paymentItemsCreated = 0;

  for (const payslip of payslips) {
    const rut = normalizeRut(payslip.rut);
    const existing = await supabase.from("hr_employees").select("id").eq("tenant_id", ctx.membership.tenant_id).eq("rut", rut).maybeSingle();
    const employeePayload = {
      afp: payslip.afp,
      area: payslip.section || null,
      base_salary: payslip.baseSalary,
      company_id: ctx.membership.company_id,
      contract_type: "contratado",
      cost_center: payslip.section || null,
      full_name: payslip.fullName,
      health_system: payslip.health,
      hire_date: payslip.hireDate,
      position: payslip.position || null,
      rut,
      status: "activo",
      tenant_id: ctx.membership.tenant_id,
      updated_by: ctx.user.id
    };
    const employeeResult = existing.data
      ? await supabase.from("hr_employees").update(employeePayload).eq("id", existing.data.id).select("id").single()
      : await supabase.from("hr_employees").insert({ ...employeePayload, created_by: ctx.user.id }).select("id").single();
    if (employeeResult.error || !employeeResult.data) {
      warnings.push(`No se pudo guardar trabajador ${payslip.rut}: ${employeeResult.error?.message}`);
      continue;
    }
    if (existing.data) updatedEmployees += 1; else createdEmployees += 1;
    const employeeId = employeeResult.data.id;
    const pdfBuffer = generatePayslipPdf(payslip);
    const storagePath = `${ctx.membership.tenant_id}/${payslip.period}/${rut}.pdf`;
    await supabase.storage.from("hr-payslips").upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    const payslipResult = await supabase.from("hr_payslips").upsert({
      advances_amount: payslip.advances,
      afp: payslip.afp,
      base_salary: payslip.baseSalary,
      compensatory_bonus_amount: payslip.compensatoryBonus,
      employee_id: employeeId,
      employee_name: payslip.fullName,
      employee_rut: rut,
      earnings_amount: payslip.totalEarnings,
      hire_date: payslip.hireDate,
      net_amount: payslip.netPay,
      original_filename: `${rut}-${payslip.period}.pdf`,
      overtime_amount: payslip.overtime,
      parse_warnings: payslip.warnings,
      period: payslip.period || period,
      position: payslip.position,
      production_bonus_amount: payslip.productionBonus,
      raw_text: payslip.rawText,
      responsibility_bonus_amount: payslip.responsibilityBonus,
      section: payslip.section,
      source_file: pdfFile.name,
      status: payslip.warnings.length ? "pendiente_revision" : "cargada",
      storage_bucket: "hr-payslips",
      storage_path: storagePath,
      sunday_surcharge_amount: payslip.sundaySurcharge,
      tenant_id: ctx.membership.tenant_id,
      total_discounts: payslip.totalDiscounts,
      total_earnings: payslip.totalEarnings,
      total_non_taxable: payslip.totalNonTaxable,
      total_taxable: payslip.totalTaxable,
      uploaded_by: ctx.user.id,
      worked_days: payslip.workedDays
    }, { onConflict: "tenant_id,employee_id,period" }).select("id").single();
    if (payslipResult.error || !payslipResult.data) {
      warnings.push(`No se pudo guardar liquidacion ${payslip.rut}: ${payslipResult.error?.message}`);
      continue;
    }
    payslipsSaved += 1;
    const components = componentRows(payslip, ctx.membership.tenant_id, employeeId, payslipResult.data.id, ctx.user.id);
    if (components.length) {
      await supabase.from("hr_salary_components").upsert(components, { onConflict: "tenant_id,employee_id,period,component_type,label,source" });
    }
    if (payslip.netPay > 0) {
      const existingPayment = await supabase
        .from("hr_payment_items")
        .select("id")
        .eq("tenant_id", ctx.membership.tenant_id)
        .eq("employee_id", employeeId)
        .eq("period", payslip.period)
        .eq("payment_type", "remuneracion_mensual")
        .maybeSingle();
      if (existingPayment.data) {
        await supabase.from("hr_payment_items").update({ amount: payslip.netPay, glosa: `Remuneracion ${payslip.monthLabel.toLowerCase()}`, status: "aprobado" }).eq("id", existingPayment.data.id);
      } else {
        await supabase.from("hr_payment_items").insert({
          amount: payslip.netPay,
          approved_at: new Date().toISOString(),
          approved_by: ctx.user.id,
          created_by: ctx.user.id,
          employee_id: employeeId,
          glosa: `Remuneracion ${payslip.monthLabel.toLowerCase()}`,
          payment_type: "remuneracion_mensual",
          period: payslip.period,
          status: "aprobado",
          tenant_id: ctx.membership.tenant_id
        });
        paymentItemsCreated += 1;
      }
    }
  }

  let accountantRowsImported = 0;
  if (xlsxFile instanceof File) {
    const rows = parseAccountantWorkbook(Buffer.from(await xlsxFile.arrayBuffer()));
    for (const row of rows) {
      const rut = normalizeRut(row.rut);
      const employee = await supabase.from("hr_employees").select("id").eq("tenant_id", ctx.membership.tenant_id).eq("rut", rut).maybeSingle();
      await supabase.from("hr_accountant_data_rows").upsert({
        absences: row.absences,
        advances_amount: row.advances,
        aguinaldo_amount: row.aguinaldo,
        cash_allowance_amount: row.cashAllowance,
        ccaf_loan_amount: row.ccafLoan,
        compensatory_bonus_amount: row.compensatoryBonus,
        company_loan_amount: row.companyLoan,
        cost_center: row.costCenter,
        created_by: ctx.user.id,
        employee_id: employee.data?.id ?? null,
        full_name: row.fullName,
        licenses: row.licenses,
        movilization_amount: row.movilization,
        observations: row.observations,
        overtime_hours: row.overtimeHours,
        period,
        phone_allowance_amount: row.phoneAllowance,
        production_bonus_amount: row.productionBonus,
        raw_row: row.raw,
        reason: row.reason,
        responsibility_bonus_amount: row.responsibilityBonus,
        row_number: row.rowNumber,
        rut,
        sheet_name: row.sheetName,
        source_file: xlsxFile.name,
        sunday_surcharge_amount: row.sundaySurcharge,
        tenant_id: ctx.membership.tenant_id,
        updated_by: ctx.user.id
      }, { onConflict: "tenant_id,period,rut,sheet_name" });
      accountantRowsImported += 1;
    }
  }

  await supabase.from("audit_events").insert({
    actor_role: ctx.membership.role,
    actor_user_id: ctx.user.id,
    after_data: { accountantRowsImported, createdEmployees, payslipsSaved, paymentItemsCreated, updatedEmployees, warnings },
    company_id: ctx.membership.company_id,
    entity_type: "hr_payroll_import",
    event_type: "hr.payroll_imported",
    tenant_id: ctx.membership.tenant_id
  });
  return NextResponse.json({ ok: true, accountantRowsImported, createdEmployees, parsedPayslips: payslips.length, payslipsSaved, paymentItemsCreated, updatedEmployees, warnings });
}
