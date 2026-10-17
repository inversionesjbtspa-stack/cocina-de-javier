import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const port = Number(process.argv[2]);
const output = process.argv[3];
if (port !== 55439 || !output) throw Error('Only isolated 127.0.0.1:55439 is allowed');
const config = {host:'127.0.0.1',port,user:'postgres',password:'',database:'postgres'};
const control = new pg.Client(config);
await control.connect();
const database = 'rrhh_rut_resolution_' + Date.now();
let db;
const checks = [];
const check = (name, condition) => {assert.ok(condition, name);checks.push({name,result:'PASS'});};
try {
  await control.query('create database "' + database + '"');
  db = new pg.Client({...config,database});await db.connect();
  await db.query(`
    create table hr_employees(id uuid primary key,tenant_id uuid,rut text,status text,hire_date date);
    create table hr_vacation_certified_openings(id uuid primary key default gen_random_uuid(),tenant_id uuid,employee_id uuid,rut text,balance_days numeric,
      effective_cutoff_date date,source text,source_file text,source_hash text,source_row integer,hire_date date,progressive_days_current integer,
      recognized_previous_years numeric,annual_entitlement_override numeric,override_reason text,internal_alert text,previous_operating_balance numeric,
      absorbed_request_ids uuid[],created_by uuid,unique(tenant_id,employee_id));
    create table hr_vacation_periods(id uuid primary key,employee_id uuid,tenant_id uuid,available_balance numeric);
    create table hr_vacation_requests(id uuid primary key,employee_id uuid,tenant_id uuid,snapshot jsonb);
    create table hr_vacation_movements(id uuid primary key,days numeric);
    create table audit_events(id uuid primary key default gen_random_uuid(),actor_role text,actor_user_id uuid,company_id uuid,tenant_id uuid,
      entity_type text,entity_id uuid,event_type text,before_data jsonb,after_data jsonb);
    create function hr_current_vacation_actor() returns table(user_id uuid,tenant_id uuid,company_id uuid,actor_role text) language sql as $$
      select '00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid,
        '00000000-0000-4000-8000-000000000003'::uuid,'admin'::text $$;
  `);
  const tenant='00000000-0000-4000-8000-000000000002', employee='00000000-0000-4000-8000-000000000004';
  await db.query("insert into hr_employees values($1,$2,'22222222-2','activo','2021-10-05')",[employee,tenant]);
  await db.query('insert into hr_vacation_periods values(gen_random_uuid(),$1,$2,70)',[employee,tenant]);
  await db.query("insert into hr_vacation_requests values(gen_random_uuid(),$1,$2,'{\"balance\":70,\"historical\":true}')",[employee,tenant]);
  const migration = await fs.readFile('supabase/migrations/202610160001_hr_certified_vacation_balances.sql','utf8');
  const rpc = migration.match(/create or replace function public\.hr_import_certified_vacation_balances[\s\S]*?\$\$;/)?.[0];
  assert.ok(rpc);await db.query(rpc);
  const rows=[{rut:'222222222',source_row:1,balance_days:27.5,progressive_days_current:0,recognized_previous_years:null,
    annual_entitlement_override:null,override_reason:null,internal_alert:null,canonical_rut:'22222222-2',source_rut:'11111111-1',
    resolved_worker_id:employee,resolution_reason:'Documentary fixture',resolution_evidence:[{file:'fixture.pdf'}]}];
  const call = 'select hr_import_certified_vacation_balances($1,$2,$3,$4::jsonb) result';
  const args=['fixture.xlsx','a'.repeat(64),'2026-10-16',JSON.stringify(rows)];
  const first=(await db.query(call,args)).rows[0].result;
  check('First import creates exactly one opening',first.created===1&&first.skipped===0);
  const opening=(await db.query('select * from hr_vacation_certified_openings')).rows[0];
  check('Opening belongs to unchanged worker',opening.employee_id===employee&&opening.rut==='222222222');
  check('Opening is exactly 27.50',Number(opening.balance_days)===27.5);
  const event=(await db.query('select * from audit_events')).rows[0];
  check('Audit retains original and canonical RUT',event.after_data.source_rut==='11111111-1'&&event.after_data.canonical_rut==='22222222-2');
  check('Audit retains worker and documentary evidence',event.after_data.resolved_worker_id===employee&&event.after_data.resolution_evidence.length===1);
  const second=(await db.query(call,args)).rows[0].result;
  check('Repeat returns zero created, one skipped',second.created===0&&second.skipped===1);
  check('Repeat preserves opening identity and all fields',JSON.stringify((await db.query('select * from hr_vacation_certified_openings')).rows[0])===JSON.stringify(opening));
  check('Repeat creates no second audit event',(await db.query('select count(*)::int n from audit_events')).rows[0].n===1);
  check('No difference movement created',(await db.query('select count(*)::int n from hr_vacation_movements')).rows[0].n===0);
  check('Historical balance remains 70',(await db.query('select snapshot from hr_vacation_requests')).rows[0].snapshot.balance===70);
  check('ERP RUT unchanged',(await db.query('select rut from hr_employees')).rows[0].rut==='22222222-2');
  await fs.mkdir(output,{recursive:true});
  const result={target:'127.0.0.1:55439',production:false,database,checks,passed:checks.length,failed:0,productionWrites:0};
  await fs.writeFile(path.join(output,'local-rut-resolution-result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {if(db)await db.end();await control.end();}
