import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const migrations = [
  "202605150001_security_foundation.sql",
  "202605150002_admin_core.sql",
  "202605150003_purchasing_workflow.sql",
  "202605150004_dte_documents.sql",
  "202605150005_finance_foundation.sql",
  "202605150006_payments.sql",
  "202605150007_admin_payment_permissions.sql",
  "202605150008_complete_dte_xml_pipeline.sql",
  "202605150009_dte_item_validation.sql"
];

const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
  await client.connect();

  await client.query(`
    create schema if not exists app_private;
    create table if not exists app_private.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  for (const migration of migrations) {
    const { rowCount } = await client.query(
      "select 1 from app_private.schema_migrations where filename = $1",
      [migration]
    );

    if (rowCount) {
      console.log(`skip ${migration}`);
      continue;
    }

    const sql = await readFile(join(process.cwd(), "supabase", "migrations", migration), "utf8");

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into app_private.schema_migrations (filename) values ($1)",
        [migration]
      );
      await client.query("commit");
      console.log(`applied ${migration}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end().catch(() => {});
}
