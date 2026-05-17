import pg from "pg";

const { Client } = pg;

const password = process.env.SUPABASE_DB_PASSWORD;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!password || !ref) {
  console.error("SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD are required.");
  process.exit(1);
}

const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "sa-east-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "eu-west-3",
  "eu-north-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-northeast-1",
  "ap-northeast-2"
];

for (const region of regions) {
  for (const port of [5432, 6543]) {
    const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:${port}/postgres`;
    const client = new Client({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 5000
    });

    try {
      await client.connect();
      const result = await client.query("select current_database() as db");
      console.log(`ok ${region}:${port} ${result.rows[0].db}`);
      await client.end();
      process.exit(0);
    } catch (error) {
      console.log(`fail ${region}:${port} ${error.code ?? "ERR"}`);
      await client.end().catch(() => {});
    }
  }
}

process.exit(1);
