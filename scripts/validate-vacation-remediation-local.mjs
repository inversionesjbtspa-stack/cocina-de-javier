import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const port=Number(process.argv[2]);
const output=process.argv[3];
if(port!==55439||!output)throw new Error('Only isolated PostgreSQL at 127.0.0.1:55439 is allowed; specify an output directory');
const config={host:'127.0.0.1',port,user:'postgres',password:'',database:'postgres'};
const control=new pg.Client(config);await control.connect();
const database='rrhh_remediation_'+Date.now();
const checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push({name,result:'PASS'});};
let db;
try {
  await control.query('create database "'+database+'"');
  db=new pg.Client({...config,database});await db.connect();
  await db.query(`
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    create table hr_vacation_certified_openings(id uuid primary key,tenant_id uuid,employee_id uuid,effective_cutoff_date date,balance_days numeric);
    create table hr_vacation_requests(id uuid primary key,tenant_id uuid,employee_id uuid,status text,document_number text,receipt_number text,receipt_status text);
    create table hr_vacation_documents(id uuid primary key default gen_random_uuid(),tenant_id uuid,employee_id uuid,vacation_request_id uuid,
      document_type text,document_status text,file_name text,file_sha256 text,file_size bigint,mime_type text,generated_at timestamptz,
      generated_by uuid,immutable_snapshot jsonb,storage_bucket text,storage_path text,created_at timestamptz default now(),version integer default 1);
    alter table hr_vacation_documents enable row level security;
    create policy local_service_writer on hr_vacation_documents to service_role using(true) with check(true);
    create policy local_tenant_reader on hr_vacation_documents for select to authenticated
      using(tenant_id=nullif(current_setting('test.tenant',true),'')::uuid);
    grant usage on schema public to service_role,authenticated,anon;
    grant select,update on hr_vacation_requests to service_role;
    grant select,insert,update on hr_vacation_documents to service_role;
    grant select on hr_vacation_documents to authenticated;
  `);
  const tenant='00000000-0000-4000-8000-000000000001',otherTenant='00000000-0000-4000-8000-000000000002';
  const employee='00000000-0000-4000-8000-000000000003',unverified='00000000-0000-4000-8000-000000000004';
  const request='00000000-0000-4000-8000-000000000005',legacy='00000000-0000-4000-8000-000000000006';
  const actor='00000000-0000-4000-8000-000000000007';
  await db.query("insert into hr_vacation_requests values($1,$2,$3,'aprobada','FER-TEST-000001','FER-TEST-000001','vigente'),($4,$2,$5,'aprobada','FER-TEST-LEGACY','FER-TEST-LEGACY','vigente')",[request,tenant,employee,legacy,unverified]);
  for(let i=0;i<5;i++)await db.query("insert into hr_vacation_documents(tenant_id,employee_id,vacation_request_id,document_type)values($1,$2,$3,'papeleta')",[tenant,unverified,legacy]);
  for(let i=0;i<23;i++)await db.query('insert into hr_vacation_certified_openings values(gen_random_uuid(),$1,$2,date \'2026-10-16\',$3)',[tenant,i===0?employee:crypto.randomUUID(),i+0.25]);
  const openingsBefore=JSON.stringify((await db.query('select * from hr_vacation_certified_openings order by id')).rows);
  async function expectCode(name,sql,args,code){
    try{await db.query(sql,args);throw new Error(name+': expected '+code);}catch(error){assert.equal(error.code,code,name);checks.push({name,result:'PASS',sqlstate:error.code,message:error.message});}
  }
  await expectCode('Original PostgREST conflict target fails with PostgreSQL 42P10',
    "insert into hr_vacation_documents(tenant_id,employee_id,vacation_request_id,document_type) values($1,$2,$3,'comprobante_feriado') on conflict(tenant_id,vacation_request_id,document_type) do update set document_status=excluded.document_status",[tenant,employee,request],'42P10');
  const securitySql="select relrowsecurity,relacl::text from pg_class where oid='hr_vacation_documents'::regclass";
  const policiesSql="select policyname,roles,cmd,qual,with_check from pg_policies where tablename='hr_vacation_documents' order by policyname";
  const securityBefore=JSON.stringify((await db.query(securitySql)).rows);
  const policiesBefore=JSON.stringify((await db.query(policiesSql)).rows);
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'local-before-migrations-'+database+'.json'),JSON.stringify({
    target:'127.0.0.1:55439',production:false,database,
    documents:(await db.query('select * from hr_vacation_documents order by id')).rows,
    requests:(await db.query('select * from hr_vacation_requests order by id')).rows,
    openings:(await db.query('select * from hr_vacation_certified_openings order by id')).rows,
    security:JSON.parse(securityBefore),policies:JSON.parse(policiesBefore)
  },null,2));
  const migration=await fs.readFile('supabase/migrations/202610170001_hr_vacation_receipt_metadata_unique.sql','utf8');
  await db.query(migration);await db.query(migration);
  check('Metadata migration executes twice',true);
  check('All five legacy duplicate papeleta rows preserved',(await db.query("select count(*)::int n from hr_vacation_documents where document_type='papeleta'")).rows[0].n===5);
  check('RLS and table grants unchanged',securityBefore===JSON.stringify((await db.query(securitySql)).rows));
  check('Tenant policies unchanged',policiesBefore===JSON.stringify((await db.query(policiesSql)).rows));
  const payload={tenant_id:tenant,employee_id:employee,vacation_request_id:request,document_type:'comprobante_feriado',
    storage_bucket:'hr-vacation-documents',storage_path:`tenants/${tenant}/employees/${employee}/vacations/${request}/FER-TEST-000001.pdf`,
    file_name:'fixture.pdf',file_sha256:'a'.repeat(64),file_size:500,mime_type:'application/pdf',generated_by:actor,immutable_snapshot:{fixture:true}};
  await db.query('set role service_role');
  const first=(await db.query('select hr_upsert_vacation_receipt_metadata($1::jsonb) id',[JSON.stringify(payload)])).rows[0].id;
  const second=(await db.query('select hr_upsert_vacation_receipt_metadata($1::jsonb) id',[JSON.stringify(payload)])).rows[0].id;
  check('RPC upsert inserts metadata',Boolean(first));check('Second RPC preserves document ID',first===second);
  check('Second RPC does not duplicate PDF metadata',(await db.query("select count(*)::int n from hr_vacation_documents where document_type='comprobante_feriado'")).rows[0].n===1);
  await db.query('select hr_upsert_vacation_receipt_metadata($1::jsonb)',[JSON.stringify({...payload,file_name:'fixture-revision.pdf',file_sha256:'b'.repeat(64)})]);
  const updated=(await db.query('select * from hr_vacation_documents where id=$1',[first])).rows[0];
  check('Existing metadata updates in place',updated.file_name==='fixture-revision.pdf'&&updated.file_sha256==='b'.repeat(64)&&updated.storage_path===payload.storage_path);
  await expectCode('Cross-tenant metadata rejected','select hr_upsert_vacation_receipt_metadata($1::jsonb)',[JSON.stringify({...payload,tenant_id:otherTenant})],'P0001');
  await expectCode('Foreign employee metadata rejected','select hr_upsert_vacation_receipt_metadata($1::jsonb)',[JSON.stringify({...payload,employee_id:unverified})],'P0001');
  await expectCode('Foreign storage path rejected','select hr_upsert_vacation_receipt_metadata($1::jsonb)',[JSON.stringify({...payload,storage_path:'other.pdf'})],'P0001');
  await db.query('reset role');await db.query('set role authenticated');
  await expectCode('Authenticated cannot directly call trusted metadata writer','select hr_upsert_vacation_receipt_metadata($1::jsonb)',[JSON.stringify(payload)],'42501');
  await db.query("select set_config('test.tenant',$1,false)",[otherTenant]);
  check('Tenant B cannot read tenant A metadata',(await db.query('select count(*)::int n from hr_vacation_documents')).rows[0].n===0);
  await db.query('reset role');
  const guard=await fs.readFile('supabase/migrations/202610170002_hr_vacation_certificate_required.sql','utf8');
  await db.query(guard);await db.query(guard);check('Certificate guard migration executes twice',true);
  await expectCode('New post-cutoff request without certificate rejected',"insert into hr_vacation_requests values(gen_random_uuid(),$1,$2,'solicitada',null,null,null)",[tenant,unverified],'P0001');
  await db.query("insert into hr_vacation_requests values(gen_random_uuid(),$1,$2,'solicitada',null,null,null)",[tenant,employee]);check('Certified request still allowed',true);
  await db.query("update hr_vacation_requests set receipt_status='vigente' where id=$1",[legacy]);
  check('Historical legacy record remains readable and unchanged',(await db.query('select status from hr_vacation_requests where id=$1',[legacy])).rows[0].status==='aprobada');
  await db.query('alter table hr_vacation_requests disable trigger hr_require_certified_vacation_request');
  const pending=crypto.randomUUID();await db.query("insert into hr_vacation_requests values($1,$2,$3,'solicitada',null,null,null)",[pending,tenant,unverified]);
  await db.query('alter table hr_vacation_requests enable trigger hr_require_certified_vacation_request');
  await expectCode('Existing uncertified pending request cannot be approved',"update hr_vacation_requests set status='aprobada' where id=$1",[pending],'P0001');
  check('Rejected approval rolls back status',(await db.query('select status from hr_vacation_requests where id=$1',[pending])).rows[0].status==='solicitada');
  check('All 23 certified openings preserved',openingsBefore===JSON.stringify((await db.query('select * from hr_vacation_certified_openings order by id')).rows));
  check('No broad metadata RPC grants',(await db.query("select has_function_privilege('anon','hr_upsert_vacation_receipt_metadata(jsonb)','execute') a,has_function_privilege('authenticated','hr_upsert_vacation_receipt_metadata(jsonb)','execute') b")).rows.every(r=>!r.a&&!r.b));
  await fs.mkdir(output,{recursive:true});
  const result={target:'127.0.0.1:55439',production:false,database,checks,passed:checks.length,failed:0,productionWrites:0,timestamp:new Date().toISOString()};
  await fs.writeFile(path.join(output,'local-postgres-validation.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {if(db)await db.end();await control.end();}
