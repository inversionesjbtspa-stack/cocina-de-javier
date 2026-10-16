import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const port=Number(process.argv[2]);
const backup=process.argv[3];
if(port!==55439||!backup)throw new Error('Isolated localhost port 55439 and backup directory required');
const base={host:'127.0.0.1',port,user:'postgres',password:'',database:'postgres'};
const control=new pg.Client(base);await control.connect();
const definitions=JSON.parse(await fs.readFile(path.join(backup,'schema.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(backup,'manifest.json'),'utf8'));
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const type=p=>/^(uuid|text|date|timestamp with time zone|timestamp without time zone|numeric|integer|bigint|boolean|jsonb|json|double precision|real)$/.test(p.format??'')?p.format:'text';
const columns=(definition,defaults=false)=>Object.entries(definition.properties).map(([name,p])=>{
  let d='';
  if(defaults&&p.default!==undefined){
    d=' default '+(['gen_random_uuid()','now()','CURRENT_DATE'].includes(p.default)?p.default:typeof p.default==='number'||typeof p.default==='boolean'?String(p.default):"'"+String(p.default).replaceAll("'","''")+"'");
  }
  return ident(name)+' '+type(p)+d+(name==='id'?' primary key':'');
}).join(',');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const normalize=(row,def)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v===null?v:/timestamp/.test(def.properties[k]?.format??'')?new Date(v).toISOString():v]));
const hashes=[];
const run=Date.now();
const restoreDatabase='rrhh_backup_restore_'+run;
const fixtureDatabase='rrhh_certified_validation_'+run;
try{
  for(const name of [restoreDatabase,fixtureDatabase]){
    const exists=await control.query('select 1 from pg_database where datname=$1',[name]);
    if(exists.rowCount)throw new Error('Local test database already exists; use a fresh isolated cluster');
    await control.query('create database '+ident(name));
  }
  const restore=new pg.Client({...base,database:restoreDatabase});await restore.connect();
  for(const item of manifest.tables){
    const bytes=await fs.readFile(path.join(backup,item.table+'.json'));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('backup_hash_mismatch');
    const rows=JSON.parse(bytes),def=definitions[item.table];
    if(!def)throw new Error('backup_schema_missing:'+item.table);
    await restore.query('create table '+ident(item.table)+' ('+columns(def)+')');
    if(rows.length)await restore.query('insert into '+ident(item.table)+' select * from json_populate_recordset(null::'+ident(item.table)+',$1::json)',[JSON.stringify(rows)]);
    const restored=await restore.query('select to_jsonb(t) as row from '+ident(item.table)+' t order by id');
    const original=rows.map(r=>normalize(r,def)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const actual=restored.rows.map(r=>normalize(r.row,def));
    if(JSON.stringify(canonical(original))!==JSON.stringify(canonical(actual)))throw new Error('restore_reconciliation_failed:'+item.table);
    hashes.push({table:item.table,restored:actual.length,verified:true});
  }
  await restore.end();
  const db=new pg.Client({...base,database:fixtureDatabase});await db.connect();
  await db.query("do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$; create schema auth; create table auth.users(id uuid primary key); create table tenants(id uuid primary key); create table companies(id uuid primary key); create type app_role as enum('owner','admin','finance_manager');");
  for(const table of ['hr_employees','hr_vacation_requests','hr_vacation_allocations','hr_vacation_movements','hr_vacation_documents','hr_document_sequences'])await db.query('create table '+ident(table)+' ('+columns(definitions[table],true)+')');
  const workflow=await fs.readFile('supabase/migrations/202607240001_hr_vacation_periods_workflow.sql','utf8');
  await db.query(workflow.slice(0,workflow.indexOf('alter table public.hr_vacation_requests')));
  await db.query(`create table audit_events(id uuid primary key default gen_random_uuid(),actor_role text,actor_user_id uuid,company_id uuid,tenant_id uuid,entity_type text,entity_id uuid,event_type text,before_data jsonb,after_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create function current_user_has_role(t uuid,r app_role[]) returns boolean language sql stable as $$ select t=nullif(current_setting('test.tenant',true),'')::uuid and auth.uid() is not null $$;
    create function hr_current_vacation_actor() returns table(user_id uuid,tenant_id uuid,company_id uuid,actor_role text) language plpgsql as $$ begin
      if auth.uid() is null then raise exception 'unauthorized';end if;
      return query select auth.uid(),current_setting('test.tenant')::uuid,current_setting('test.company')::uuid,'admin'::text;end $$;
    create function hr_vacation_has_overlap(uuid,uuid,date,date,uuid) returns boolean language sql as $$ select false $$;
    create function hr_vacation_calendar_status(uuid,date,date) returns text language sql as $$ select 'verified'::text $$;
    create function hr_next_document_number(uuid,text,integer) returns text language sql as $$ select 'TEST-'||gen_random_uuid()::text $$;
    grant usage on schema public,auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated;
  `);
  const original=await fs.readFile('supabase/migrations/202607240002_hr_vacation_transaction_hardening.sql','utf8');
  for(const name of ['hr_create_vacation_request','hr_release_vacation_reservations','hr_cancel_vacation_request']){
    const start=original.indexOf('create or replace function public.'+name+'('),end=original.indexOf('$$;',start)+3;
    await db.query(original.slice(start,end));
  }
  const migration=await fs.readFile('supabase/migrations/202610160001_hr_certified_vacation_balances.sql','utf8');
  await db.query(migration);await db.query(migration);
  const fixture=await fs.readFile('tests/fixtures/certified-vacations-integration.sql','utf8');
  await db.query(fixture);
  await db.end();
  const result={target:'127.0.0.1:55439 (isolated local PostgreSQL 17)',production:false,restore:hashes,
    restoreDatabase,fixtureDatabase,
    restoreScope:'Typed data roundtrip from PostgREST schema; original database functions/RLS are not a pg_dump backup.',
    migrationAppliedTwice:true,fixtureTests:'PASS',productionWrites:0,timestamp:new Date().toISOString()};
  await fs.writeFile(path.join(backup,'restore-validation.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await control.end();}
