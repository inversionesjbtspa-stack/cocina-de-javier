import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

if (Number(process.argv[2]) !== 55439 || !process.argv[3]) throw Error('Only isolated 127.0.0.1:55439 and an output directory are allowed');
const config = {host:'127.0.0.1',port:55439,user:'postgres',password:'',database:'postgres'};
const control = new pg.Client(config); await control.connect();
const database = 'rrhh_administrative_validation_' + Date.now();
const checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push({name,result:'PASS'});};
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [tenant,employee,user,company,request,period,opening,allocation,otherTenant,otherUser,viewer,normalRequest,normalPeriod]=Array.from({length:13},(_,i)=>id(i+1));
let db;
const connection=()=>new pg.Client({...config,database});
const extract=(sql,name)=>{const start=sql.indexOf('create or replace function public.'+name+'(');assert.ok(start>=0);return sql.slice(start,sql.indexOf('$$;',start)+3);};
async function rejected(query,args,expected){try{await db.query(query,args);assert.fail('Expected '+expected);}catch(error){assert.equal(error.message,expected);}}
try {
  await control.query('create database "'+database+'"');
  db=connection();await db.connect();
  await db.query(`
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create type app_role as enum('owner','admin','finance_manager','viewer');
    create table tenants(id uuid primary key);
    create table hr_employees(id uuid primary key,tenant_id uuid);
    create table user_memberships(user_id uuid,tenant_id uuid,company_id uuid,role app_role,status text,created_at timestamptz default now());
    create table hr_vacation_certified_openings(id uuid primary key,tenant_id uuid,employee_id uuid,balance_days numeric,effective_cutoff_date date,
      hire_date date,base_days numeric,progressive_days_current integer,recognized_previous_years numeric,annual_entitlement_override numeric,
      absorbed_request_ids uuid[],unique(id,tenant_id,employee_id));
    create table hr_vacation_requests(id uuid primary key,tenant_id uuid,employee_id uuid,status text,certified_opening_balance_id uuid,
      start_date date,end_date date,document_number text,receipt_number text,receipt_status text,cancelled_by uuid,cancelled_at timestamptz,
      observation text,document_generation_status text,version integer default 1,updated_by uuid,updated_at timestamptz);
    create table hr_vacation_periods(id uuid primary key,tenant_id uuid,employee_id uuid,base_days numeric,used_days numeric,advance_days numeric default 0,
      available_balance numeric generated always as(base_days-used_days-advance_days) stored,version integer default 1,updated_by uuid,updated_at timestamptz,
      certified_opening_balance_id uuid,earned_on date);
    create table hr_vacation_allocations(id uuid primary key,tenant_id uuid,employee_id uuid,request_id uuid,vacation_period_id uuid,
      allocation_status text,allocation_type text,allocation_order integer,allocated_days numeric,reversed_at timestamptz,reversed_by uuid,reverse_movement_id uuid);
    create table hr_vacation_movements(id uuid primary key default gen_random_uuid(),tenant_id uuid,employee_id uuid,vacation_period_id uuid,
      request_id uuid,movement_type text,days numeric,previous_balance numeric,resulting_balance numeric,created_by uuid,notes text,metadata jsonb);
    create table hr_vacation_documents(tenant_id uuid,vacation_request_id uuid,document_status text,cancelled_by uuid,cancelled_at timestamptz,cancellation_reason text,pdf_fixture text);
    create table audit_events(actor_role app_role,actor_user_id uuid,after_data jsonb,before_data jsonb,company_id uuid,entity_id uuid,entity_type text,event_type text,tenant_id uuid);
    create table hr_vacation_entitlement_changes(opening_id uuid,effective_from date,progressive_days_current integer,recognized_previous_years numeric,annual_entitlement_override numeric);
    create function hr_release_vacation_reservations(uuid,text) returns numeric language sql as $$select 0::numeric$$;
    grant usage on schema public,auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  const foundation=await fs.readFile('supabase/migrations/202605150001_security_foundation.sql','utf8');
  await db.query(extract(foundation,'current_user_has_role'));
  const workflow=await fs.readFile('supabase/migrations/202607240002_hr_vacation_transaction_hardening.sql','utf8');
  await db.query(extract(workflow,'hr_current_vacation_actor'));
  await db.query(extract(workflow,'hr_cancel_vacation_request'));
  const certified=await fs.readFile('supabase/migrations/202610160001_hr_certified_vacation_balances.sql','utf8');
  for(const name of ['hr_certified_opening_immutable','hr_certified_annual_days','hr_guard_absorbed_vacation_reversal']) await db.query(extract(certified,name));
  await db.query('create trigger hr_guard_absorbed_vacation_reversal before update on hr_vacation_requests for each row execute function hr_guard_absorbed_vacation_reversal()');
  await db.query('insert into tenants values($1),($2)',[tenant,otherTenant]);
  await db.query('insert into auth.users values($1),($2),($3)',[user,otherUser,viewer]);
  await db.query('insert into hr_employees values($1,$2)',[employee,tenant]);
  await db.query("insert into user_memberships(user_id,tenant_id,company_id,role,status) values($1,$2,$3,'admin','active'),($4,$5,$3,'admin','active'),($6,$2,$3,'viewer','active')",[user,tenant,company,otherUser,otherTenant,viewer]);
  await db.query("insert into hr_vacation_certified_openings values($1,$2,$3,27.5,current_date,'2021-10-05',15,0,null,null,array[$4]::uuid[])",[opening,tenant,employee,request]);
  await db.query('insert into hr_employees values($1,$2)',[id(14),otherTenant]);
  await db.query("insert into hr_vacation_certified_openings values($1,$2,$3,41.25,current_date,'2020-01-01',15,0,null,null,'{}')",[id(15),otherTenant,id(14)]);
  await db.query("insert into hr_vacation_requests(id,tenant_id,employee_id,status,start_date,end_date,document_number,receipt_status) values($1,$2,$3,'aprobada',current_date-40,current_date-34,'TEST-FER-HIST','vigente')",[request,tenant,employee]);
  await db.query('insert into hr_vacation_periods(id,tenant_id,employee_id,base_days,used_days) values($1,$2,$3,15,5)',[period,tenant,employee]);
  await db.query("insert into hr_vacation_allocations(id,tenant_id,employee_id,request_id,vacation_period_id,allocation_status,allocation_type,allocation_order,allocated_days) values($1,$2,$3,$4,$5,'consumed','earned',1,5)",[allocation,tenant,employee,request,period]);
  await db.query("insert into hr_vacation_documents(tenant_id,vacation_request_id,document_status,pdf_fixture) values($1,$2,'vigente','original-pdf-bytes-fixture')",[tenant,request]);
  const migration=await fs.readFile('supabase/migrations/202610180001_hr_vacation_administrative_cancellation.sql','utf8');
  await db.query(migration);await db.query(migration);check('Additive migration is repeatable',true);
  const stateSql=`select jsonb_build_object('openings',(select jsonb_agg(to_jsonb(t)) from hr_vacation_certified_openings t),
    'requests',(select jsonb_agg(to_jsonb(t)) from hr_vacation_requests t),'periods',(select jsonb_agg(to_jsonb(t)) from hr_vacation_periods t),
    'allocations',(select jsonb_agg(to_jsonb(t)) from hr_vacation_allocations t),'movements',(select jsonb_agg(to_jsonb(t)) from hr_vacation_movements t),
    'documents',(select jsonb_agg(to_jsonb(t)) from hr_vacation_documents t)) state`;
  const before=(await db.query(stateSql)).rows[0].state;
  await db.query("select set_config('test.user',$1,false)",[user]);
  await rejected('select hr_cancel_vacation_request($1,$2)',[request,'Fixture'],'legacy_vacation_requires_cutoff_review');
  check('Original economic guard still blocks absorbed history',true);
  const call='select hr_administratively_cancel_vacation_request($1,$2) result';
  await db.query('set role authenticated');
  const result=(await db.query(call,[request,'Synthetic administrative reason'])).rows[0].result;
  check('Administrative status recorded explicitly',result.status==='anulada_administrativamente');
  check('Effect exactly zero; certified 27.50 preserved',Number(result.balance_effect)===0&&Number(result.balance_before)===27.5&&Number(result.balance_after)===27.5);
  const repeat=(await db.query(call,[request,'Second invocation'])).rows[0].result;
  check('Repeat is idempotent and retains original identity',repeat.already_cancelled===true&&repeat.id===result.id&&repeat.administrative_cancel_reason==='Synthetic administrative reason');
  const clients=[connection(),connection()];
  try {
    for(const client of clients){await client.connect();await client.query("select set_config('test.user',$1,false)",[user]);await client.query('set role authenticated');}
    const concurrent=await Promise.all(clients.map(client=>client.query(call,[request,'Concurrent retry'])));
    check('Concurrent retries return the same single cancellation',concurrent.every(r=>r.rows[0].result.id===result.id&&r.rows[0].result.already_cancelled));
  } finally {for(const client of clients)await client.end();}
  await db.query('reset role');
  check('Requests, balances, FIFO, movements and PDF remain byte-for-byte unchanged',JSON.stringify((await db.query(stateSql)).rows[0].state)===JSON.stringify(before));
  check('Other employee and tenant certificate is untouched',Number((await db.query('select balance_days from hr_vacation_certified_openings where id=$1',[id(15)])).rows[0].balance_days)===41.25);
  const audits=(await db.query('select * from audit_events')).rows;
  check('Exactly one audit records worker, request, receipt, user and zero effect',audits.length===1&&audits[0].entity_id===request&&audits[0].after_data.worker_id===employee&&audits[0].after_data.receipt_id==='TEST-FER-HIST'&&Number(audits[0].after_data.balance_effect)===0);
  check('No financial reversal persisted',(await db.query('select count(*)::int n from hr_vacation_movements')).rows[0].n===0);
  await db.query("select set_config('test.user',$1,false)",[otherUser]);await db.query('set role authenticated');
  await rejected(call,[request,'Cross tenant'],'vacation_not_found');
  check('Cross-tenant RPC denied',true);
  check('Cross-tenant RLS select returns no records',(await db.query('select * from hr_vacation_administrative_cancellations')).rowCount===0);
  await db.query('reset role');await db.query("select set_config('test.user',$1,false)",[viewer]);await db.query('set role authenticated');
  await rejected(call,[request,'Forbidden viewer'],'hr_forbidden');
  check('Unprivileged role cannot cancel or read administrative rows',(await db.query('select * from hr_vacation_administrative_cancellations')).rowCount===0);
  await db.query('reset role');await db.query("select set_config('test.user','',false)");await db.query('set role authenticated');
  await rejected(call,[request,'No session'],'unauthorized');check('Missing authenticated identity rejected',true);
  await db.query('reset role');await db.query("select set_config('test.user',$1,false)",[user]);await db.query('set role authenticated');
  let directDenied=false;try{await db.query('insert into hr_vacation_administrative_cancellations default values');}catch(e){directDenied=e.code==='42501';}
  check('Authenticated role has no direct INSERT privilege',directDenied);
  await rejected(call,[request,'   '],'administrative_cancel_reason_required');check('Reason required even on repeated call',true);
  await db.query('reset role');
  await rejected('update hr_vacation_administrative_cancellations set administrative_cancel_reason=$1',['Tamper'],'certified_opening_is_immutable');check('Administrative audit row is immutable',true);
  await db.query("insert into hr_vacation_requests(id,tenant_id,employee_id,status,certified_opening_balance_id,start_date,end_date) values($1,$2,$3,'aprobada',$4,current_date+1,current_date+7)",[normalRequest,tenant,employee,opening]);
  await rejected(call,[normalRequest,'Not historical'],'vacation_not_absorbed_history');check('Normal request cannot use administrative route',true);
  await db.query('insert into hr_vacation_periods(id,tenant_id,employee_id,base_days,used_days,certified_opening_balance_id,earned_on) values($1,$2,$3,27.5,5,$4,current_date)',[normalPeriod,tenant,employee,opening]);
  await db.query("insert into hr_vacation_allocations(id,tenant_id,employee_id,request_id,vacation_period_id,allocation_status,allocation_type,allocation_order,allocated_days) values(gen_random_uuid(),$1,$2,$3,$4,'consumed','earned',1,5)",[tenant,employee,normalRequest,normalPeriod]);
  const economic=(await db.query('select hr_cancel_vacation_request($1,$2) result',[normalRequest,'Normal fixture'])).rows[0].result;
  check('Normal post-cutoff economic reversal remains functional',Number(economic.reversed_days)===5);
  check('Normal cancellation restores its actual certified bucket',(await db.query('select available_balance from hr_vacation_periods where id=$1',[normalPeriod])).rows[0].available_balance==='27.5');
  await fs.mkdir(process.argv[3],{recursive:true});
  const summary={database,target:'127.0.0.1:55439',production:false,passed:checks.length,failed:0,checks,productionCancellations:0};
  await fs.writeFile(path.join(process.argv[3],'administrative-local-validation.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
} finally {if(db)await db.end();await control.end();}
