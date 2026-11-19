import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { certifiedVacationSummary, buildCertifiedVacationPeriods, type CertifiedOpeningBalance } from "../src/lib/hr/vacation-certified.ts";
import { materializeVacationAnniversaries } from "../src/lib/hr/vacation-anniversaries.ts";

const asOf = "2026-11-18";
const fixture: CertifiedOpeningBalance = { id: "fixture-opening", employeeId: "fixture-worker", tenantId: "fixture-tenant",
  balanceDays: 31, effectiveCutoffDate: "2026-10-16", hireDate: "2022-11-02", baseDays: 15,
  progressiveDaysCurrent: 0, recognizedPreviousYears: null, annualEntitlementOverride: null,
  overrideReason: null, internalAlert: null, source: "synthetic-fixture" };

for (const [label, balanceDays, hireDate, expected] of [
  ["A",31,"2022-11-02",46], ["B",18.75,"2024-11-01",33.75], ["C",23.75,"2024-11-01",38.75]
] as const) {
  test(`materialized fixture ${label} replaces its virtual anniversary without increasing balance`, () => {
    const opening = { ...fixture, balanceDays, hireDate };
    const before = certifiedVacationSummary(opening, [], asOf);
    const annuity = buildCertifiedVacationPeriods(opening, [], asOf)![1];
    const persisted = { ...annuity, id: "fixture-persisted-period" };
    const after = certifiedVacationSummary(opening, [persisted], asOf);
    assert.equal(before.available, expected);
    assert.equal(after.available, expected);
    assert.equal(after.periods?.length, 2);
    assert.equal(after.periods?.[1].id, persisted.id);
    assert.equal(opening.balanceDays, balanceDays);
  });
}

test("read projections remain idempotent after materialization and preserve absorbed history", () => {
  const annuity = { ...buildCertifiedVacationPeriods(fixture, [], asOf)![1], id: "fixture-persisted-period" };
  const legacy = { id:"legacy", periodStart:"2020-01-01", periodEnd:"2020-12-31", baseDays:500, availableBalance:500 };
  const input = [annuity, legacy];
  const before = JSON.stringify(input);
  for (let i = 0; i < 3; i++) assert.equal(certifiedVacationSummary(fixture, input, asOf).available, 46);
  assert.equal(JSON.stringify(input), before);
});

for (const [balanceDays, hireDate, next, override] of [[24,"2016-03-01","2027-03-01",17],[25,"2006-12-01","2026-12-01",17]] as const) {
  test(`future fixture anniversary ${next} remains unearned`, () => {
    const opening = { ...fixture, balanceDays, hireDate, annualEntitlementOverride: override };
    assert.equal(certifiedVacationSummary(opening, [], asOf).available, balanceDays);
    assert.equal(certifiedVacationSummary(opening, [], asOf).nextAnniversary, next);
    assert.equal(buildCertifiedVacationPeriods(opening, [], asOf)!.length, 1);
  });
}

test("scheduled materialization deduplicates tenants and trusts only RPC result", async () => {
  const calls: string[] = [];
  const result = await materializeVacationAnniversaries({ rpc: async (name, args) => {
    assert.equal(name, "hr_materialize_certified_anniversaries");
    assert.deepEqual(Object.keys(args), ["p_tenant_id"]);
    calls.push(args.p_tenant_id);
    return { data: { created_count: 3 }, error: null };
  } }, ["fixture-b", "fixture-a", "fixture-a"]);
  assert.deepEqual(calls, ["fixture-a", "fixture-b"]);
  assert.equal(result.created, 6);
});

test("scheduled repeat creates zero and does not fabricate another entitlement", async () => {
  assert.deepEqual(await materializeVacationAnniversaries({ rpc: async () => ({ data: { created_count: 0 }, error: null }) }, ["fixture"]), { created: 0 });
});

test("RPC errors stop the scheduled run with a safe error", async () => {
  await assert.rejects(materializeVacationAnniversaries({ rpc: async () => ({ data: null, error: { message: "private database detail" } }) }, ["fixture"]), /^Error: vacation_anniversary_materialization_failed$/);
});

test("materialization SQL preserves economic data and requires service role", async () => {
  const sql = await readFile("supabase/migrations/202611180001_hr_materialize_certified_anniversaries.sql", "utf8");
  assert.match(sql, /on conflict\(certified_opening_balance_id,earned_on\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /anniversary_materialization_changed_balance/);
  assert.match(sql, /future_anniversary_materialization_forbidden/);
  assert.match(sql, /hr_certified_annual_days\(o,earned\)/);
  assert.doesNotMatch(sql, /(?:update|delete from) public\.hr_vacation_/i);
  assert.doesNotMatch(sql, /insert into public\.hr_vacation_(?:movements|requests|allocations|certified_openings)/i);
  assert.match(sql, /grant execute.*to service_role/);
  assert.doesNotMatch(sql, /grant execute.*to (?:public|anon|authenticated)/i);
});

test("daily cron is authenticated, uncached and separate from read-only previews", async () => {
  const route = await readFile("src/app/api/hr/vacations/anniversaries/materialize/route.ts", "utf8");
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /status: 401/);
  assert.match(route, /Cache-Control.*no-store/);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const jobs = config.crons.filter((job: { path: string }) => job.path === "/api/hr/vacations/anniversaries/materialize");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].schedule, "0 7 * * *");
  const preview = await readFile("src/app/api/hr/vacations/preview/route.ts", "utf8");
  assert.doesNotMatch(preview, /hr_materialize_certified_anniversaries/);
});
