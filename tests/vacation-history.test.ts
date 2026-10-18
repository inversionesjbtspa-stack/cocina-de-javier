import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyVacationMovement, isAbsorbedVacationRequest, LEGACY_VACATION_REVIEW_MESSAGE, vacationActionMessage, vacationCancellationMode } from "../src/lib/hr/vacation-history.ts";
import { certifiedVacationSummary, mapCertifiedOpening } from "../src/lib/hr/vacation-certified.ts";
import { isCancelledVacationRequest, isOperationalVacationRequest } from "../src/lib/hr/vacation-domain.ts";

const opening = { id: "opening", effectiveCutoffDate: "2026-10-16", absorbedRequestIds: ["old-request"] };
const historic = { id: "old-request", startDate: "2026-09-08", endDate: "2026-09-14", openingBalanceId: null };
const movement = { id: "old-movement", requestId: historic.id, effectiveDate: null, requestStartDate: historic.startDate, requestEndDate: historic.endDate, createdAt: "2026-10-18" };

test("historical movement registered after cutoff is not operational", () => {
  assert.equal(classifyVacationMovement({ ...movement, requestId: "other" }, opening), "historical");
});
test("absorbed request overrides even a misleading post-cutoff effective date", () => {
  assert.equal(classifyVacationMovement({ ...movement, effectiveDate: "2026-10-18" }, opening), "absorbed");
});
test("registration alone never proves an operating effect", () => {
  assert.equal(classifyVacationMovement({ id: "unknown", effectiveDate: null, createdAt: "2026-10-18" } as typeof movement, opening), "review");
});
test("effective date and entitlement date classify genuine operating movements", () => {
  assert.equal(classifyVacationMovement({ id: "new", effectiveDate: "2026-10-17" }, opening), "operational");
  assert.equal(classifyVacationMovement({ id: "new", effectiveDate: null, periodEarnedOn: "2027-01-01", periodOpeningBalanceId: opening.id }, opening), "operational");
});
test("same-day legacy movement is not assumed post-cutoff", () => {
  assert.equal(classifyVacationMovement({ id: "same-day", effectiveDate: "2026-10-16" }, opening), "historical");
});
test("legacy review API message is human and actionable", () => {
  assert.equal(vacationActionMessage("legacy_vacation_requires_cutoff_review"), LEGACY_VACATION_REVIEW_MESSAGE);
  assert.match(LEGACY_VACATION_REVIEW_MESSAGE, /anulación administrativa sin afectar el saldo actual/);
});
test("normal certified request keeps financial cancellation", () => {
  assert.equal(vacationCancellationMode({ ...historic, id: "new", openingBalanceId: opening.id, endDate: "2026-11-01" }, opening, "2026-10-18"), "economic");
});
test("absorbed historic request selects separate administrative workflow", () => {
  assert.equal(vacationCancellationMode(historic, opening, "2026-10-18"), "administrative");
  assert.equal(isAbsorbedVacationRequest(historic, opening, "2026-10-18"), true);
});
test("uncertain legacy history and not-yet-active openings are not eligible", () => {
  assert.equal(vacationCancellationMode({ ...historic, id: "unknown" }, opening, "2026-10-18"), "historical_review");
  assert.equal(isAbsorbedVacationRequest(historic, opening, "2026-10-15"), false);
  assert.equal(isAbsorbedVacationRequest({ ...historic, endDate: "2026-11-01" }, opening, "2026-10-18"), false);
});
test("administrative cancellation is historical, never scheduled", () => {
  assert.equal(vacationCancellationMode({ ...historic, administrativeCancellation: { cancelledAt: "2026-10-18", reason: "Fixture" } }, opening, "2026-10-18"), "administratively_cancelled");
  assert.equal(isCancelledVacationRequest("anulada_administrativamente"), true);
  assert.equal(isOperationalVacationRequest("anulada_administrativamente"), false);
});
test("absorbed historic period never reduces certified 27.50", () => {
  const certified = mapCertifiedOpening({ id: "opening", employee_id: "worker", tenant_id: "tenant", balance_days: 27.5,
    effective_cutoff_date: "2026-10-16", hire_date: "2021-10-05", base_days: 15, progressive_days_current: 0, absorbed_request_ids: [historic.id] });
  const oldPeriod = { id: "legacy", employeeId: "worker", periodStart: "2021-10-05", periodEnd: "2022-10-04", baseDays: 15, usedDays: 5, availableBalance: 10 };
  const before = structuredClone(certified);
  const summary = certifiedVacationSummary(certified, [oldPeriod], "2026-10-18");
  assert.equal(summary.available, 27.5);
  assert.deepEqual(certified, before);
  assert.deepEqual(certified.absorbedRequestIds, [historic.id]);
});
test("administrative route uses authenticated RPC, never receipt renderer or admin writes", () => {
  const route = fs.readFileSync("src/app/api/hr/vacations/[id]/administrative-cancel/route.ts", "utf8");
  assert.match(route, /requireHrContext/);
  assert.match(route, /await createClient\(\)/);
  assert.match(route, /hr_administratively_cancel_vacation_request/);
  assert.doesNotMatch(route, /createAdminClient|persistVacationReceipt|\.upload\(|\.update\(|\.insert\(/);
});
test("migration is additive and does not bypass financial guard or write economic tables", () => {
  const sql = fs.readFileSync("supabase/migrations/202610180001_hr_vacation_administrative_cancellation.sql", "utf8");
  assert.match(sql, /check \(balance_effect = 0\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /hr_current_vacation_actor\(\)/);
  assert.match(sql, /set search_path=public,pg_temp/);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.hr_vacation_(?:movements|periods|requests|documents|certified_openings)\b/i);
  assert.doesNotMatch(sql, /(?:drop|disable) trigger.*hr_guard_absorbed/i);
});
