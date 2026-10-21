import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateLegalVacationDays, calculateVacationPreview, type Holiday } from "../src/lib/hr/vacation-domain.ts";
import { safeVacationHolidays } from "../src/lib/hr/vacation-server.ts";
import { buildVacationReceiptModel, renderVacationReceiptPdf } from "../src/lib/hr/vacation-receipt.ts";
const calendarSql = fs.readFileSync("supabase/migrations/202610210001_hr_verified_legal_holidays.sql", "utf8");
const holidays: Holiday[] = [...calendarSql.matchAll(/\('(2026-\d\d-\d\d)','([^']+)',(?:true|false)\)/g)].map(([,date,name]) => ({date,name,scope:"national"}));
test("official 2026 calendar includes all sixteen national dates and October 12",()=>{
  assert.equal(holidays.length,16); assert.ok(holidays.some(x=>x.date==="2026-10-12"));
  assert.deepEqual(safeVacationHolidays(null),[]);
});
test("October 9-19 has eleven calendar days, six deductible and five non-deductible",()=>{
  const days=calculateLegalVacationDays({startDate:"2026-10-09",endDate:"2026-10-19",legalHolidays:holidays});
  assert.equal(days.calendarDays,11);assert.equal(days.daysToDeduct,6);
  assert.equal(days.saturdays,2);assert.equal(days.sundays,2);assert.equal(days.legalHolidays,1);
  assert.deepEqual(days.legalHolidayDates,["2026-10-12"]);
  assert.equal(days.calendarDays-days.daysToDeduct,5);
});
for(const [label,start,end,expected] of [
  ["weekday holiday","2026-10-12","2026-10-12",0],
  ["Saturday holiday","2026-10-31","2026-10-31",0],
  ["Sunday holiday","2026-11-01","2026-11-01",0],
  ["starts on holiday","2026-10-12","2026-10-13",1],
  ["ends on holiday","2026-10-09","2026-10-12",1],
  ["multiple holidays","2026-04-02","2026-04-06",2]
] as const) test(label,()=>assert.equal(calculateLegalVacationDays({startDate:start,endDate:end,legalHolidays:holidays}).daysToDeduct,expected));
test("preview and persisted receipt share six days and balance nine",()=>{
  const preview=calculateVacationPreview({startDate:"2026-10-09",endDate:"2026-10-19",asOf:"2026-10-21",hireDate:"2025-10-01",holidays,
    agreementAccepted:true,calendarStatusByYear:{2026:"verified"},periods:[{baseDays:15,availableBalance:15,periodStart:"2025-10-01",periodEnd:"2026-09-30"}]});
  assert.equal(preview.businessDays,6);assert.equal(preview.totalAfterRequest,9);
  const model=buildVacationReceiptModel({id:"fixture",businessDays:preview.businessDays,nonBusinessDays:5,startDate:"2026-10-09",endDate:"2026-10-19",
    company:{legalName:"Empresa ficticia",rut:"",address:"",phone:""},employee:{fullName:"Trabajador ficticio",rut:""},previousBalance:15,resultingBalance:9});
  assert.equal(model.businessDays,6);assert.equal(model.nonBusinessDays,5);assert.equal(model.resultingBalance,9);
  assert.ok(renderVacationReceiptPdf(model).byteLength>1000);
});
test("incomplete calendar cannot authorize a new vacation",()=>{
  const preview=calculateVacationPreview({startDate:"2026-10-09",endDate:"2026-10-19",asOf:"2026-10-21",hireDate:"2025-10-01",agreementAccepted:true,
    calendarStatusByYear:{2026:"incomplete"},periods:[{baseDays:15,availableBalance:15,periodStart:"2025-10-01",periodEnd:"2026-09-30"}]});
  assert.equal(preview.canConfirm,false);assert.ok(preview.reviewReasons.includes("holiday_calendar_incomplete"));
});
test("correction preserves opening and old movement, versions document, and cancels only net six later",()=>{
  const sql=fs.readFileSync("supabase/migrations/202610210002_hr_vacation_holiday_correction.sql","utf8");
  assert.match(sql,/request_id uuid not null unique/);assert.match(sql,/already_corrected',true,'applied_days',0/);
  assert.match(sql,/used_days=used_days-delta/);assert.match(sql,/allocated_days=correct_days/);
  assert.doesNotMatch(sql,/update public\.hr_vacation_(?:certified_openings|movements)\b/i);
  assert.match(sql,/previous_hash/);assert.match(sql,/previous_path/);assert.match(sql,/corrected_by/);
  const route=fs.readFileSync("src/app/api/hr/vacations/[id]/holiday-correction/route.ts","utf8");
  assert.match(route,/authenticated\.rpc\("hr_correct_vacation_legal_holidays"/);
  assert.doesNotMatch(route,/hr_create_vacation_request|hr_approve_vacation_request/);
});
