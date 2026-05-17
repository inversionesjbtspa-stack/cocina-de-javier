import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const requiredTables = [
  "tenants",
  "companies",
  "profiles",
  "permissions",
  "role_permissions",
  "user_memberships",
  "suppliers",
  "products",
  "purchase_requests",
  "purchase_orders",
  "dte_documents",
  "accounts_payable",
  "payment_batches",
  "payments",
  "budgets",
  "audit_events"
];

const requiredBuckets = [
  "dte-xml-originals",
  "dte-pdf-rendered",
  "payment-files"
];

const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
  await client.connect();

  const tables = await client.query(
    `
      select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname = any($1::text[])
      order by c.relname;
    `,
    [requiredTables]
  );

  const tableNames = new Set(tables.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !tableNames.has(table));
  const tablesWithoutRls = tables.rows
    .filter((row) => !row.rls_enabled)
    .map((row) => row.table_name);

  const indexes = await client.query(
    `
      select count(*)::int as count
      from pg_indexes
      where schemaname = 'public';
    `
  );

  const foreignKeys = await client.query(
    `
      select count(*)::int as count
      from information_schema.table_constraints
      where constraint_schema = 'public'
        and constraint_type = 'FOREIGN KEY';
    `
  );

  const policies = await client.query(
    `
      select count(*)::int as count
      from pg_policies
      where schemaname = 'public';
    `
  );

  const storagePolicies = await client.query(
    `
      select count(*)::int as count
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects';
    `
  );

  const permissions = await client.query(
    "select count(*)::int as count from public.permissions"
  );

  const buckets = await client.query(
    "select id from storage.buckets where id = any($1::text[]) order by id",
    [requiredBuckets]
  );

  const bucketNames = new Set(buckets.rows.map((row) => row.id));
  const missingBuckets = requiredBuckets.filter((bucket) => !bucketNames.has(bucket));

  console.log(
    JSON.stringify(
      {
        ok:
          missingTables.length === 0 &&
          tablesWithoutRls.length === 0 &&
          missingBuckets.length === 0,
        missingTables,
        tablesWithoutRls,
        tableCount: tables.rows.length,
        indexCount: indexes.rows[0].count,
        foreignKeyCount: foreignKeys.rows[0].count,
        publicPolicyCount: policies.rows[0].count,
        storagePolicyCount: storagePolicies.rows[0].count,
        permissionCount: permissions.rows[0].count,
        buckets: buckets.rows.map((row) => row.id),
        missingBuckets
      },
      null,
      2
    )
  );
} finally {
  await client.end().catch(() => {});
}
