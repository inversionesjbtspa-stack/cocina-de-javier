import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseVacationImportFile } from '../src/lib/hr/vacation-import.ts';
import { previewCertifiedVacationBalances } from '../src/lib/hr/vacation-certified.ts';

const args=process.argv.slice(2);
const option=name=>args[args.indexOf(name)+1];
for(const name of ['--source','--backup-dir','--overrides','--as-of','--output-dir']){
  if(!args.includes(name)||!option(name))throw new Error('Missing '+name);
}
const out=path.resolve(option('--output-dir'));
if(out===process.cwd()||out.startsWith(process.cwd()+path.sep))throw new Error('Preview containing personal data must be outside Git');
const source=await fs.readFile(option('--source'));
const backup=option('--backup-dir');
const read=async name=>JSON.parse(await fs.readFile(path.join(backup,name+'.json'),'utf8'));
const workers=await read('hr_employees'),periods=await read('hr_vacation_periods'),progressive=await read('hr_vacation_progressive_records');
const overrides=JSON.parse(await fs.readFile(option('--overrides'),'utf8'));
const rows=parseVacationImportFile(source,path.basename(option('--source')));
const employees=workers.filter(e=>e.status==='activo').map(e=>({
  id:e.id,rut:e.rut,fullName:e.full_name,hireDate:e.hire_date,tenantId:e.tenant_id,
  currentBalance:periods.filter(p=>p.employee_id===e.id).reduce((sum,p)=>sum+Number(p.available_balance),0),
  progressiveRecords:progressive.filter(p=>p.employee_id===e.id).map(p=>({
    previousEmployerYears:Number(p.previous_employer_years),accreditationDate:p.accreditation_date,
    effectiveFrom:p.effective_from,recognizedDays:Number(p.recognized_days),status:p.status
  }))
}));
const alternatives=['2026-10-16','2026-10-31'].map(cutoffDate=>({
  cutoffDate,rows:previewCertifiedVacationBalances({rows,employees,cutoffDate,asOf:option('--as-of'),overrides})
}));
const data={generatedAt:new Date().toISOString(),sourceFile:path.basename(option('--source')),
  sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),asOf:option('--as-of'),
  productionWrites:0,alternatives};
data.summary={total:rows.length,sourceDays:alternatives[0].rows.reduce((sum,r)=>sum+r.balanceDays,0),
  matchedDays:alternatives[0].rows.filter(r=>r.employeeId).reduce((sum,r)=>sum+r.balanceDays,0),
  states:Object.fromEntries([...new Set(alternatives[0].rows.map(r=>r.status))].map(state=>[state,alternatives[0].rows.filter(r=>r.status===state).length]))};
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'preview.json'),JSON.stringify(data,null,2));
const fields=['rowNumber','rut','employeeName','balanceDays','cutoffDate','isActive','currentBalance','annualEntitlement','progressiveDays','override','nextAnniversary','status','alerts'];
const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
for(const alternative of alternatives){
  await fs.writeFile(path.join(out,'preview-'+alternative.cutoffDate+'.csv'),'\uFEFF'+
    [fields.join(';'),...alternative.rows.map(r=>fields.map(f=>csv(Array.isArray(r[f])?r[f].join(' / '):r[f])).join(';'))].join('\r\n'));
}
const fmt=v=>v==null?'—':typeof v==='number'?v.toFixed(2):String(v).replaceAll('|','/');
let markdown='# Preview certificado — SOLO LECTURA\n\n'+
  'Fuente: '+data.sourceFile+' / Hoja1. SHA256: '+data.sourceSha256+'\n\n'+
  JSON.stringify(data.summary)+'\n';
for(const alternative of alternatives){
  markdown+='\n## Corte '+alternative.cutoffDate+'\n\n'+
    '| Fila | RUT | Trabajador | Certificado | Derecho anual | Progresivos | Override | Próxima anualidad | Estado |\n'+
    '|---|---|---|---:|---:|---:|---|---|---|\n'+alternative.rows.map(r=>'| '+
      [String(r.rowNumber),r.rut,r.employeeName,r.balanceDays,r.annualEntitlement,r.progressiveDays,r.override?'Sí':'No',r.nextAnniversary,r.status].map(fmt).join(' | ')+' |').join('\n')+'\n';
}
await fs.writeFile(path.join(out,'preview.md'),markdown);
console.log(JSON.stringify({summary:data.summary,sourceSha256:data.sourceSha256,outputDirectory:out,productionWrites:0}));
