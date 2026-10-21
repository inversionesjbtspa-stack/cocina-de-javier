import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { uncertifiedVacationPreview, vacationCertificationBlock, VACATION_CERTIFICATION_REQUIRED_MESSAGE } from "../src/lib/hr/vacation-certification-policy.ts";
import { buildCertifiedVacationPeriods, certifiedVacationSummary, previewCertifiedVacationBalances, type CertifiedOpeningBalance } from "../src/lib/hr/vacation-certified.ts";
import { calculateVacationPreview } from "../src/lib/hr/vacation-domain.ts";
import { buildVacationReceiptModel } from "../src/lib/hr/vacation-receipt.ts";
import { persistVacationReceiptForRequest, type VacationReceiptPersistenceClient } from "../src/lib/hr/vacation-server.ts";

const opening: CertifiedOpeningBalance = { id:"fixture-opening",employeeId:"fixture-employee",tenantId:"fixture-tenant",balanceDays:4,
  effectiveCutoffDate:"2026-10-16",hireDate:"2020-07-28",baseDays:15,progressiveDaysCurrent:0,
  annualEntitlementOverride:null,overrideReason:null,recognizedPreviousYears:null,internalAlert:null,source:"fixture.xlsx" };

test("post-cutoff without certificate returns no legacy balance and cannot confirm",()=>{
  const block=vacationCertificationBlock("2026-10-17",false)!;
  const result=uncertifiedVacationPreview(block);
  assert.equal(result.balanceBefore,null);assert.equal(result.balanceAfter,null);
  assert.equal(result.preview.totalAvailable,null);assert.equal(result.preview.totalAfterRequest,null);
  assert.equal(result.preview.canConfirm,false);assert.equal(result.preview.valid,false);
  assert.deepEqual(result.allocations,[]);assert.equal(result.status,"REQUIERE SALDO CERTIFICADO");
  assert.equal(result.message,VACATION_CERTIFICATION_REQUIRED_MESSAGE);
});

test("active certificate keeps canonical calculation and pre-cutoff reads remain compatible",()=>{
  assert.equal(vacationCertificationBlock("2026-10-17",true),null);
  assert.equal(vacationCertificationBlock("2026-10-15",false),null);
  const p=calculateVacationPreview({asOf:"2026-10-17",hireDate:opening.hireDate,startDate:"2026-10-19",endDate:"2026-10-20",
    agreementAccepted:true,periods:buildCertifiedVacationPeriods(opening,[],"2026-10-17")!});
  assert.equal(p.totalAvailable,4);assert.equal(p.totalAfterRequest,2);
});

test("Egliany-like fixture without certificate is blocked even for backdated vacation dates",()=>{
  const block=vacationCertificationBlock("2026-10-17",false)!;
  assert.equal(block.canConfirm,false);
  // Certification follows the evaluation date, not a backdated September rest period.
  assert.equal(uncertifiedVacationPreview(block).preview.totalAvailable,null);
});

test("conflicting RUT never matches by identical name",()=>{
  const [row]=previewCertifiedVacationBalances({rows:[{rowNumber:1,values:{NOMBRE:"PERSONA FICTICIA",RUT:"11.111.111-1",VACACIONES:"27,50"}}],
    employees:[{id:"existing",tenantId:"local",rut:"22222222-2",fullName:"PERSONA FICTICIA",hireDate:"2021-10-05",currentBalance:70}],cutoffDate:"2026-10-16",asOf:"2026-10-17"});
  assert.equal(row.employeeId,null);assert.equal(row.status,"RUT NO ENCONTRADO");
});

test("historical receipt snapshot is preserved, not replaced with current certified balance",()=>{
  const model=buildVacationReceiptModel({id:"fixture",receiptNumber:"FER-TEST",employee:{fullName:"FICTICIO",rut:"FICTICIO"},
    company:{legalName:"FICTICIA",rut:"FICTICIO",address:"LOCAL",phone:"LOCAL"},startDate:"2026-09-01",endDate:"2026-09-07",
    businessDays:5,previousBalance:75,resultingBalance:70,documentDate:"2026-10-16"});
  assert.equal(model.resultingBalance,70);assert.equal(certifiedVacationSummary(opening,[],"2026-10-17").available,4);
});

test("all confirmation entry points check certification before legacy calculation or RPC",async()=>{
  for(const file of ["src/app/api/hr/vacations/route.ts","src/app/api/hr/vacations/preview/route.ts","src/app/api/hr/vacations/[id]/approve/route.ts"]){
    const code=await readFile(file,"utf8");const guard=code.indexOf("vacationCertificationBlock(asOf");
    assert.ok(guard>0,file);
    for(const action of ["const periods =",'supabase.rpc("hr_approve_vacation_request"','authSupabase.rpc("hr_create_vacation_request"']){
      const index=code.indexOf(action);if(index>=0)assert.ok(index>guard,file+" "+action);
    }
  }
  const ui=await readFile("src/components/hr/vacation-components.tsx","utf8");
  assert.match(ui,/REQUIERE SALDO CERTIFICADO/);assert.match(ui,/!requiresCertifiedBalance \? <div/);
  assert.match(ui,/disabled=\{!previewValidAndCurrent/);
});

function receiptClient(options:{storageError?:boolean;metadataError?:boolean}={}){
  const request={id:"fixture-request",tenant_id:"fixture-tenant",status:"aprobada",business_days:5,
    start_date:"2026-10-19",end_date:"2026-10-23",document_date:"2026-10-17",document_number:"FER-TEST",previous_balance:10,resulting_balance:5,
    note:"",hr_employees:{id:"fixture-employee",full_name:"FICTICIO",rut:"FICTICIO",hire_date:"2020-01-01"}};
  const files=new Map<string,Buffer>();const documents=new Map<string,Record<string,unknown>>();const calls:string[]=[];
  const client={
    from(table:string){
      const chain={eq(){return chain;},async maybeSingle(){return {data:table==="companies"?{legal_name:"EMPRESA FICTICIA"}:request};},async order(){return {data:[]};}};
      return {select(){return chain;}};
    },
    async rpc(name:string,args:{p_metadata:Record<string,unknown>}){
      calls.push(name);if(options.metadataError)return {error:{message:"fixture_metadata_error"}};
      const p=args.p_metadata;const key=String(p.tenant_id)+":"+String(p.vacation_request_id)+":"+String(p.document_type);
      const previous=documents.get(key);documents.set(key,{...p,id:previous?.id??"fixture-document"});return {data:"fixture-document",error:null};
    },
    storage:{from(){return {async upload(key:string,body:Buffer,settings:{upsert:boolean}){
      assert.equal(settings.upsert,true);if(options.storageError)return {error:{message:"fixture_storage_error"}};
      files.set(key,body);return {error:null};
    }};}}
  } as unknown as VacationReceiptPersistenceClient;
  return {client,request,files,documents,calls};
}
async function persist(f:ReturnType<typeof receiptClient>){
  return persistVacationReceiptForRequest({companyId:"fixture-company",tenantId:"fixture-tenant",requestId:"fixture-request",userId:"fixture-user",supabase:f.client});
}

test("receipt metadata uses the partial-index RPC and second run preserves document and PDF identity",async()=>{
  const f=receiptClient();assert.equal((await persist(f)).ok,true);assert.equal((await persist(f)).ok,true);
  assert.deepEqual(f.calls,["hr_upsert_vacation_receipt_metadata","hr_upsert_vacation_receipt_metadata"]);
  assert.equal(f.files.size,1);assert.equal(f.documents.size,1);assert.equal([...f.documents.values()][0].id,"fixture-document");
});

test("existing receipt metadata updates without creating another document or file",async()=>{
  const f=receiptClient();await persist(f);const before=[...f.documents.values()][0];f.request.note="REVISION FICTICIA LOCAL";
  assert.equal((await persist(f)).ok,true);const after=[...f.documents.values()][0];
  assert.equal(after.id,before.id);assert.notEqual(after.file_sha256,before.file_sha256);assert.equal(after.storage_path,before.storage_path);
  assert.equal(f.documents.size,1);assert.equal(f.files.size,1);
});

test("storage and metadata failures remain explicit and never falsely mark success",async()=>{
  const storage=receiptClient({storageError:true});assert.equal((await persist(storage)).ok,false);assert.equal(storage.calls.length,0);
  const metadata=receiptClient({metadataError:true});assert.equal((await persist(metadata)).ok,false);assert.equal(metadata.documents.size,0);
});

test("23 synthetic certified balances stay untouched including zero, decimals and negatives",()=>{
  const balances=[4,24,25,-1.25,...Array.from({length:19},(_,i)=>i+0.25)];const before=JSON.stringify(balances);
  for(const balanceDays of balances){const state=certifiedVacationSummary({...opening,balanceDays},[],"2026-10-17");assert.equal(state.available,balanceDays);}
  assert.equal(balances.length,23);assert.equal(JSON.stringify(balances),before);
});

test("metadata migration preserves legacy duplicates, RLS, grants and conflict predicate",async()=>{
  const sql=await readFile("supabase/migrations/202610170001_hr_vacation_receipt_metadata_unique.sql","utf8");
  assert.match(sql,/create unique index if not exists/);assert.match(sql,/where document_type='comprobante_feriado'/);
  assert.match(sql,/on conflict \(tenant_id,vacation_request_id,document_type\)/);assert.match(sql,/security invoker/);
  assert.match(sql,/duplicate_vacation_receipt_metadata_requires_review/);
  assert.doesNotMatch(sql,/delete from|truncate|disable row level security|grant.*to (public|anon|authenticated)/i);
});

test("tracked changes remain limited to HR vacation remediation, never Trading or bank modules",()=>{
  const files=execFileSync("git",["diff","HEAD","--name-only"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
  for(const file of files)assert.match(file,/^(src\/app\/api\/hr\/vacations\/|src\/components\/hr\/(vacation-components|hr-dashboard-client)\.tsx$|src\/lib\/hr\/data\.ts$|src\/lib\/hr\/vacation-|tests\/vacation-|tests\/hr-module\.test\.ts$|scripts\/validate-vacation-|supabase\/migrations\/20261017|supabase\/migrations\/20261018000[12]_hr_vacation_administrative_(cancellation|credit)\.sql$|supabase\/migrations\/202610200001_hr_vacation_overlap_administrative\.sql$|supabase\/migrations\/20261021000[12]_hr_(verified_legal_holidays|vacation_holiday_correction)\.sql$|reports\/hr_vacation_)/);
});
