import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
if(!args.includes('--env-file')||!args.includes('--output-dir')) throw new Error('Required: --env-file <private config> --output-dir <outside Git>');
const config={};
for(const raw of (await fs.readFile(option('--env-file'),'utf8')).split(/\r?\n/)){
  const m=raw.trim().match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(!m)continue;
  config[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');
}
const base=config.NEXT_PUBLIC_SUPABASE_URL,key=config.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw new Error('missing_supabase_config');
const headers={apikey:key,Authorization:`Bearer ${key}`};
const schemaResponse=await fetch(new URL('/rest/v1/',base),{headers:{...headers,Accept:'application/openapi+json'}});
if(!schemaResponse.ok)throw new Error('schema_read_failed');
const schema=await schemaResponse.json();
const tables=['hr_employees','hr_vacation_balances','hr_vacation_ledger','hr_vacation_periods','hr_vacation_requests',
  'hr_vacation_movements','hr_vacation_allocations','hr_vacation_progressive_records','hr_vacation_import_batches',
  'hr_vacation_documents','hr_document_sequences'];
const out=path.resolve(option('--output-dir'));
if(out.startsWith(process.cwd()+path.sep))throw new Error('backup_must_be_outside_worktree');
await fs.mkdir(out,{recursive:true});
const manifest={capturedAt:new Date().toISOString(),projectMasked:new URL(base).hostname.slice(0,4)+'***',method:'GET only',tables:[],schemaFile:'schema.json',restoreTest:null};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const schemaBytes=JSON.stringify(Object.fromEntries(tables.map(t=>[t,schema.definitions?.[t]??null])),null,2);
await fs.writeFile(path.join(out,'schema.json'),schemaBytes);
manifest.schemaSha256=hash(schemaBytes);
for(const table of tables){
  const rows=[];
  for(let offset=0;;offset+=500){
    const url=new URL('/rest/v1/'+table,base);url.searchParams.set('select','*');url.searchParams.set('order','id.asc');
    const response=await fetch(url,{method:'GET',headers:{...headers,Range:`${offset}-${offset+499}`},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`backup_failed:${table}:HTTP${response.status}`);
    const page=await response.json();rows.push(...page);if(page.length<500)break;
  }
  const data=JSON.stringify(rows,null,2);await fs.writeFile(path.join(out,table+'.json'),data);
  manifest.tables.push({table,rows:rows.length,sha256:hash(data)});
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({path:out,...manifest}));
