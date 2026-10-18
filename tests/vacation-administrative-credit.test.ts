import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { certifiedVacationSummary, mapCertifiedOpening } from "../src/lib/hr/vacation-certified.ts";
import { allocateVacationFifo } from "../src/lib/hr/vacation-domain.ts";
import { classifyVacationMovement } from "../src/lib/hr/vacation-history.ts";

const opening = mapCertifiedOpening({ id: "opening", employee_id: "fictional-worker", tenant_id: "tenant", balance_days: 27.5,
  effective_cutoff_date: "2026-10-16", hire_date: "2021-10-05", base_days: 15, progressive_days_current: 0, absorbed_request_ids: ["historical-request"] });
const bucket = { id: "certified-period", employeeId: "fictional-worker", openingBalanceId: "opening", earnedOn: "2026-10-16",
  periodStart: "2026-10-16", periodEnd: "2026-10-16", baseDays: 0, positiveAdjustments: 32.5, availableBalance: 32.5, usedDays: 0 };

test("credit keeps certified photograph 27.50 and exposes adjustment +5 and operating 32.50", () => {
  const before = structuredClone(opening);
  const summary = certifiedVacationSummary(opening, [bucket], "2026-10-18");
  assert.equal(summary.opening, 27.5);
  assert.equal(summary.adjustments, 5);
  assert.equal(summary.available, 32.5);
  assert.deepEqual(opening, before);
});
test("explicit zero-effect administrative mode preserves available 27.50", () => {
  const summary = certifiedVacationSummary(opening, [], "2026-10-18");
  assert.equal(summary.available, 27.5);
  assert.equal(summary.adjustments, 0);
});
test("future FIFO uses the persisted 32.50, not the immutable opening", () => {
  const summary = certifiedVacationSummary(opening, [bucket], "2026-10-18");
  assert.ok(summary.isActive);
  const allocation = allocateVacationFifo(summary.periods, 30);
  assert.equal(allocation.remainingDays, 0);
  assert.equal(allocation.allocations[0].previousBalance, 32.5);
  assert.equal(allocation.allocations[0].resultingBalance, 2.5);
});
test("original absorbed debit remains historical while new credit is operating", () => {
  const reference = { id: "movement", requestId: "historical-request", requestStartDate: "2026-09-08", effectiveDate: "2026-10-18" };
  assert.equal(classifyVacationMovement({ ...reference, movementType: "aprobacion", source: "system" }, opening), "absorbed");
  assert.equal(classifyVacationMovement({ ...reference, movementType: "administrative_cancellation_credit", source: "administrative_cancellation", periodOpeningBalanceId: opening.id }, opening), "operational");
});
test("a credit label without a certified period is not enough to bypass absorption", () => {
  assert.equal(classifyVacationMovement({ id: "unverified", requestId: "historical-request", movementType: "administrative_cancellation_credit", source: "administrative_cancellation", effectiveDate: "2026-10-18" }, opening), "absorbed");
});
test("subsequent normal usage keeps credit auditable without doubling it", () => {
  const summary = certifiedVacationSummary(opening, [{ ...bucket, usedDays: 5, availableBalance: 27.5 }], "2026-10-18");
  assert.equal(summary.adjustments, 5);
  assert.equal(summary.available, 27.5);
  assert.equal(summary.used, 5);
});
test("administrative API requires an explicit boolean and passes it to the authenticated RPC", () => {
  const route = fs.readFileSync("src/app/api/hr/vacations/[id]/administrative-cancel/route.ts", "utf8");
  assert.match(route, /returnDays: z\.boolean\(\)/);
  assert.match(route, /p_return_days: parsed\.data\.returnDays/);
  assert.doesNotMatch(route, /returnDays:.*default\(/);
  const ui = fs.readFileSync("src/components/hr/hr-dashboard-client.tsx", "utf8");
  assert.match(ui, /useState<"none" \| "credit" \| null>\(null\)/);
  assert.match(ui, /NO, SOLO ANULAR DOCUMENTO/);
  assert.match(ui, /SÍ, ANULAR Y DEVOLVER DÍAS/);
  assert.match(ui, /disabled=\{!returnMode \|\| !administrativeReason\.trim\(\)/);
});
test("credit migration preserves original administrative record, financial guard and PDFs", () => {
  const sql = fs.readFileSync("supabase/migrations/202610180002_hr_vacation_administrative_credit.sql", "utf8");
  assert.match(sql, /unique index if not exists hr_vacation_admin_credit_request_uidx/);
  assert.match(sql, /already_credited',true,'applied_days',0/);
  assert.match(sql, /hr_current_vacation_actor\(\)/);
  assert.match(sql, /set search_path=public,pg_temp/);
  assert.doesNotMatch(sql, /(?:update|delete from) public\.hr_vacation_(?:certified_openings|administrative_cancellations|allocations|requests|documents)\b/i);
  assert.doesNotMatch(sql, /(?:disable|drop) trigger.*hr_guard_absorbed|\.upload\(|renderVacationReceipt/);
});
