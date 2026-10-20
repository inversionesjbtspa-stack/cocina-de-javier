import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateVacationPreview } from "../src/lib/hr/vacation-domain.ts";

const sql = fs.readFileSync("supabase/migrations/202610200001_hr_vacation_overlap_administrative.sql", "utf8");
test("canonical SQL ignores administrative overlays without requiring a financial credit", () => {
  assert.match(sql, /and not exists\s*\([\s\S]*cancellation\.request_id = request\.id/);
  assert.match(sql, /cancellation\.tenant_id = request\.tenant_id/);
  assert.match(sql, /cancellation\.employee_id = request\.employee_id/);
  assert.doesNotMatch(sql, /hr_vacation_movements|hr_vacation_certified_openings|\b(?:update|insert into|delete from)\b/i);
});
test("only actual active or completed canonical statuses block; cancelled, rejected and drafts do not", () => {
  const statuses = sql.match(/request\.status in \(([^)]+)\)/)![1].match(/'[^']+'/g)!.map(x => x.slice(1, -1));
  assert.deepEqual(statuses, ["solicitada", "pendiente", "aprobada", "en_curso", "finalizada"]);
  for (const status of ["anulada", "rechazada", "anulada_administrativamente", "borrador"]) assert.ok(!statuses.includes(status));
});
test("preview consumes authenticated canonical RPC and fails closed on missing results", () => {
  const route = fs.readFileSync("src/app/api/hr/vacations/preview/route.ts", "utf8");
  assert.match(route, /authenticated = await createClient\(\)/);
  assert.match(route, /authenticated\.rpc\("hr_preview_vacation_overlap"/);
  assert.match(route, /typeof hasOverlap !== "boolean"/);
  assert.doesNotMatch(route, /\.in\("status"|overlappingRequests/);
  assert.match(sql, /return public\.hr_vacation_has_overlap\(actor\.tenant_id/);
});
test("confirmation and reservation continue using the same protected database predicate", () => {
  for (const file of ["202608210001_hr_global_vacation_calendar_policy.sql", "202610160001_hr_certified_vacation_balances.sql"]) {
    const workflow = fs.readFileSync(`supabase/migrations/${file}`, "utf8");
    assert.match(workflow, /if public\.hr_vacation_has_overlap\([\s\S]*?raise exception 'vacation_overlap'/);
  }
  assert.match(sql, /hr_current_vacation_actor\(\)/);
  assert.match(sql, /id = p_employee_id and tenant_id = actor\.tenant_id/);
  assert.match(sql, /revoke all on function public\.hr_vacation_has_overlap/);
  assert.doesNotMatch(sql, /alter table|create policy|disable row level security/i);
});
test("five-day fixture previews 32.50 to 27.50 without mutating periods", () => {
  const periods = [{ id: "fictional-certified-period", baseDays: 0, positiveAdjustments: 32.5, availableBalance: 32.5,
    periodStart: "2026-10-16", periodEnd: "2026-10-16", continuousBlockUsed: 10 }];
  const before = structuredClone(periods);
  const preview = calculateVacationPreview({ asOf: "2026-10-20", hireDate: "2021-10-05", startDate: "2026-09-08", endDate: "2026-09-14",
    periods, agreementAccepted: true, calendarStatusByYear: { "2026": "verified" } });
  assert.equal(preview.calendarDays, 7);
  assert.equal(preview.businessDays, 5);
  assert.equal(preview.totalAvailable, 32.5);
  assert.equal(preview.totalAfterRequest, 27.5);
  assert.equal(preview.canConfirm, true);
  assert.deepEqual(periods, before);
});
