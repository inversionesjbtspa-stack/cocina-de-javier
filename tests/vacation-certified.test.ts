import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseVacationDays } from "../src/lib/hr/vacation-days.ts";
import { buildCertifiedVacationPeriods, certifiedAnnualEntitlement, certifiedVacationSummary, nextVacationAnniversary,
  previewCertifiedVacationBalances, mapCertifiedOpening, type CertifiedOpeningBalance } from "../src/lib/hr/vacation-certified.ts";
import { calculateVacationPreview, vacationPeriodIsVested } from "../src/lib/hr/vacation-domain.ts";
import { calculateVacationBalanceAt } from "../src/lib/hr/vacation-persistence.ts";
import { parseVacationImportFile, previewVacationImport } from "../src/lib/hr/vacation-import.ts";

const opening: CertifiedOpeningBalance = Object.freeze({ id:"fixture-opening",employeeId:"fixture-worker",tenantId:"fixture-tenant",balanceDays:4,
  effectiveCutoffDate:"2026-10-16",hireDate:"2020-07-28",baseDays:15,progressiveDaysCurrent:0,
  annualEntitlementOverride:null,overrideReason:null,recognizedPreviousYears:null,internalAlert:null,source:"fixture.xlsx" });

for(const [input,expected] of [["17.25",17.25],["17,25",17.25],["27.5",27.5],["27,5",27.5],["-1.25",-1.25],["-1,25",-1.25],["27.50",27.5],["0",0],["15",15],["23.75",23.75]] as const){
  test(`certified vacation decimal ${input}`,()=>assert.equal(parseVacationDays(input),expected));
}
test("certified parser rejects ambiguous thousands and excessive precision instead of corrupting days",()=>{
  for(const value of ["1.234,50","1,234.50","1.23456","17.25abc","",null,NaN,Infinity])assert.equal(parseVacationDays(value),null);
});

test("legacy import preview also preserves dot/comma fractional and negative balances",()=>{
  for(const balance of ["17.25","17,25","-1.25","-1,25","27.50"]){
    const parsedRows=parseVacationImportFile(Buffer.from("RUT;Saldo;Fecha corte\n11111111-1;"+balance+";2026-10-16"),"fixture.csv");
    const preview=previewVacationImport({parsedRows,employees:[{id:"e",rut:"11111111-1",fullName:"FICTICIO"}],
      importType:"balances",sourceHash:"fixture",periodResolver:()=>({id:"p",periodStart:"2026-10-16",periodEnd:"2026-10-16"})});
    assert.equal(preview.rows[0].status,"LISTO");
    assert.equal(preview.rows[0].days,Number(balance.replace(",",".")));
  }
});
test("opening supports exact fractional, zero and negative days",()=>{
  for(const balanceDays of [0,17.25,27.5,-1.25])assert.equal(certifiedVacationSummary({...opening,balanceDays},[],"2026-10-16").available,balanceDays);
});
test("Jesus starts at certified 4, never historical 110, 114 or difference -106",()=>{
  const legacy=[{baseDays:110,availableBalance:110,periodStart:"2020-07-28",periodEnd:"2021-07-27"}];
  assert.equal(certifiedVacationSummary(opening,legacy,"2026-10-16").available,4);
});
test("future cutoff stays inactive and cannot replace legacy balance",()=>{
  assert.equal(buildCertifiedVacationPeriods({...opening,effectiveCutoffDate:"2026-10-31"},[],"2026-10-16"),null);
  assert.equal(certifiedVacationSummary({...opening,effectiveCutoffDate:"2026-10-31"},[],"2026-10-16").isActive,false);
});
test("future structural periods do not vest and ordinary current service year is not yet vested",()=>{
  assert.equal(vacationPeriodIsVested({periodStart:"2026-07-28",periodEnd:"2027-07-27"},"2026-10-16"),false);
  const balance=calculateVacationBalanceAt({asOf:"2026-10-16",periods:[{period_start:"2026-07-28",period_end:"2027-07-27",base_days:15}]});
  assert.equal(balance.available,0);
});
test("anniversary only vests on due date and repeated reads create no entries",()=>{
  assert.equal(certifiedVacationSummary(opening,[],"2027-07-27").available,4);
  for(let i=0;i<3;i++)assert.equal(certifiedVacationSummary(opening,[],"2027-07-28").available,19);
  assert.equal(nextVacationAnniversary(opening.hireDate,"2026-10-16"),"2027-07-28");
});
test("Felipe accrues exactly 17 from March 2027; opening 24 stays unchanged",()=>{
  const felipe={...opening,balanceDays:24,hireDate:"2016-03-01",annualEntitlementOverride:17,progressiveDaysCurrent:2};
  assert.equal(certifiedVacationSummary(felipe,[],"2027-02-28").available,24);
  assert.equal(certifiedVacationSummary(felipe,[],"2027-03-01").available,41);
  assert.equal(felipe.balanceDays,24);
});
test("Sandro retains administrative override 17 instead of automatic 18 or later increase",()=>{
  const sandro={...opening,balanceDays:25,hireDate:"2006-12-01",annualEntitlementOverride:17,progressiveDaysCurrent:2};
  assert.equal(certifiedAnnualEntitlement(sandro,"2026-12-01"),17);
  assert.equal(certifiedAnnualEntitlement(sandro,"2030-12-01"),17);
  assert.equal(certifiedVacationSummary(sandro,[],"2026-11-30").available,25);
  assert.equal(certifiedVacationSummary(sandro,[],"2026-12-01").available,42);
});
test("negative opening carries through next annual credit and cannot be ignored by confirmation",()=>{
  const state=certifiedVacationSummary({...opening,balanceDays:-1.25},[],"2027-07-28");
  assert.equal(state.available,13.75);
  if(!state.isActive)throw new Error("inactive");
  const preview=calculateVacationPreview({asOf:"2027-07-28",startDate:"2027-08-02",requestedBusinessDays:14,hireDate:opening.hireDate,
    periods:state.periods,agreementAccepted:true});
  assert.equal(preview.canConfirm,false);
});
test("consumption and exact reversal affect operational bucket, not opening",()=>{
  const periods=buildCertifiedVacationPeriods(opening,[],"2026-10-16")!;
  const consumed={...periods[0],usedDays:3,availableBalance:1};
  assert.equal(certifiedVacationSummary(opening,[consumed],"2026-10-16").available,1);
  assert.equal(certifiedVacationSummary(opening,[{...consumed,usedDays:0,availableBalance:4}],"2026-10-16").available,4);
  assert.equal(opening.balanceDays,4);
});
test("mapped certified opening is immutable",()=>{
  const record=mapCertifiedOpening({id:"fixture",employee_id:"worker",tenant_id:"tenant",balance_days:4,effective_cutoff_date:"2026-10-16",
    hire_date:"2020-07-28",base_days:15,progressive_days_current:0,annual_entitlement_override:null,source:"fixture"});
  assert.equal(Object.isFrozen(record),true);
});

test("audited annual changes apply prospectively without rewriting opening or prior annuities",()=>{
  const versioned={...opening,balanceDays:25,hireDate:"2006-12-01",annualEntitlementOverride:17,progressiveDaysCurrent:2,
    entitlementChanges:[{effectiveFrom:"2027-01-01",progressiveDaysCurrent:3,recognizedPreviousYears:null,annualEntitlementOverride:18}]};
  assert.equal(certifiedAnnualEntitlement(versioned,"2026-12-01"),17);
  assert.equal(certifiedAnnualEntitlement(versioned,"2027-12-01"),18);
  const summary=certifiedVacationSummary(versioned,[],"2027-12-01");
  assert.equal(summary.available,60);
  assert.equal(versioned.balanceDays,25);
  assert.equal(versioned.annualEntitlementOverride,17);
});
test("certified preview matches normalized RUT only and excludes unmatched rows",()=>{
  const rows=previewCertifiedVacationBalances({rows:[{rowNumber:4,values:{RUT:"11.111.111-1",NOMBRE:"Different name",VACACIONES:"-1.25"}},
    {rowNumber:5,values:{RUT:"22.222.222-2",NOMBRE:"Fixture",VACACIONES:"17,25"}}],
    employees:[{id:"e",tenantId:"t",rut:"11111111-1",fullName:"Fixture",hireDate:"2020-07-28",currentBalance:110}],cutoffDate:"2026-10-31",asOf:"2026-10-16"});
  assert.equal(rows[0].employeeId,"e");assert.equal(rows[0].balanceDays,-1.25);
  assert.equal(rows[1].employeeId,null);assert.equal(rows[1].status,"RUT NO ENCONTRADO");
});
test("Sandro preview is ready with nonblocking internal alert and explicit override",()=>{
  const [row]=previewCertifiedVacationBalances({rows:[{rowNumber:15,values:{RUT:"22.222.222-2",NOMBRE:"Fixture",VACACIONES:"25"}}],
    employees:[{id:"e",tenantId:"t",rut:"22222222-2",fullName:"Fixture",hireDate:"2006-12-01",currentBalance:315}],cutoffDate:"2026-10-31",asOf:"2026-10-16",
    overrides:{"222222222":{annual:17,progressive:2,reason:"Administrative certificate",alert:"REVISAR ANTECEDENTES DE FERIADO PROGRESIVO"}}});
  assert.equal(row.status,"LISTO CON ALERTA");assert.equal(row.annualEntitlement,17);assert.equal(row.progressiveDays,2);
  assert.equal(row.nextAnniversary,"2026-12-01");
});
test("prepared SQL keeps certified rows immutable and imports atomic/idempotent without historical updates",async()=>{
  const migration=await readFile("supabase/migrations/202610160001_hr_certified_vacation_balances.sql","utf8");
  assert.match(migration,/before update or delete/);assert.match(migration,/enable row level security/);
  assert.match(migration,/certified_opening_already_exists/);assert.match(migration,/skipped:=skipped\+1/);
  assert.match(migration,/hr_guard_certified_vacation_mutation/);
  assert.doesNotMatch(migration,/grant execute.*to (public|anon)/i);
});

test("legacy writes cannot silently bypass active certified balances",async()=>{
  for(const file of ["src/app/api/hr/vacations/import/route.ts","src/app/api/hr/vacations/accruals/route.ts"]){
    assert.match(await readFile(file,"utf8"),/certified_balance_requires_audited_adjustment/);
  }
  assert.match(await readFile("src/app/api/hr/vacations/progressive/route.ts","utf8"),/certified_entitlement_requires_audited_change/);
});
