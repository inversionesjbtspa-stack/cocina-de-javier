import { readFile } from "node:fs/promises";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const master = JSON.parse(await readFile("src/data/suppliers-master.json", "utf8"));
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const summary = { inserted: 0, updated: 0, bankAccounts: 0, skipped: 0 };
try {
  const tenant = await client.query("select id from public.tenants where slug='la-cocina-de-javier' limit 1");
  const company = await client.query("select id from public.companies where tenant_id=$1 limit 1", [tenant.rows[0].id]);
  for (const supplier of master.suppliers) {
    if (!/^[0-9]+-[0-9kK]$/.test(supplier.rut)) { summary.skipped += 1; continue; }
    const saved = await client.query(
      `insert into public.suppliers (
         tenant_id, company_id, rut, legal_name, trade_name, email, phone, category,
         payment_terms_label, observations, profile_source, status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'master proveedores jesus','active')
       on conflict (tenant_id, rut) do update set
         company_id = coalesce(public.suppliers.company_id, excluded.company_id),
         trade_name = coalesce(nullif(public.suppliers.trade_name,''), excluded.trade_name),
         email = coalesce(nullif(public.suppliers.email,''), excluded.email),
         phone = coalesce(nullif(public.suppliers.phone,''), excluded.phone),
         category = coalesce(nullif(public.suppliers.category,''), excluded.category),
         payment_terms_label = coalesce(nullif(public.suppliers.payment_terms_label,''), excluded.payment_terms_label),
         observations = coalesce(nullif(public.suppliers.observations,''), excluded.observations),
         profile_source = case when public.suppliers.profile_source='manual' then public.suppliers.profile_source else excluded.profile_source end
       returning id, (xmax=0) as inserted`,
      [tenant.rows[0].id, company.rows[0].id, supplier.rut, supplier.businessName, supplier.tradeName || null, supplier.email || null, supplier.phone || null, supplier.category || null, supplier.paymentTerms || null, supplier.observations || null]
    );
    summary[saved.rows[0].inserted ? "inserted" : "updated"] += 1;
    if (supplier.bankName && supplier.bankAccount && supplier.bankName !== "#N/A" && supplier.bankAccount !== "#N/A") {
      const existing = await client.query("select id from public.supplier_bank_accounts where supplier_id=$1 and account_number=$2 limit 1", [saved.rows[0].id, supplier.bankAccount]);
      if (!existing.rowCount) {
        await client.query(
          `insert into public.supplier_bank_accounts (
             tenant_id, supplier_id, bank_name, bank_code, account_type, account_number,
             account_holder_name, account_holder_rut
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenant.rows[0].id, saved.rows[0].id, supplier.bankName, supplier.bankCode || null, supplier.accountType || "", supplier.bankAccount, supplier.businessName, supplier.rut]
        );
        summary.bankAccounts += 1;
      } else if (supplier.bankCode && supplier.bankCode !== "#N/A") {
        await client.query(
          `update public.supplier_bank_accounts set
             bank_code = coalesce(nullif(bank_code,''), $2),
             account_type = coalesce(nullif(account_type,''), $3),
             bank_name = coalesce(nullif(bank_name,''), $4)
           where id=$1`,
          [existing.rows[0].id, supplier.bankCode, supplier.accountType || "no_informada_master", supplier.bankName]
        );
      }
    }
  }
  console.log(JSON.stringify(summary, null, 2));
} finally { await client.end(); }
