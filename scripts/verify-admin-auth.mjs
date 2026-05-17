import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!supabaseUrl || !anonKey || !email || !password) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ADMIN_EMAIL and ADMIN_PASSWORD are required."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email,
  password
});

if (authError || !authData.user) {
  throw authError ?? new Error("Admin login failed.");
}

const { data: memberships, error: membershipError } = await supabase
  .from("user_memberships")
  .select("tenant_id, company_id, branch_id, role, status")
  .eq("status", "active");

if (membershipError) {
  throw membershipError;
}

const adminMembership = memberships.find((membership) => membership.role === "admin");

if (!adminMembership) {
  throw new Error("Admin membership not found through authenticated RLS.");
}

const { data: rolePermissions, error: permissionsError } = await supabase
  .from("role_permissions")
  .select("permission_code")
  .eq("role", "admin");

if (permissionsError) {
  throw permissionsError;
}

const permissions = rolePermissions.map((item) => item.permission_code).sort();
const requiredPermissions = [
  "dashboard.read",
  "suppliers.manage",
  "products.manage",
  "purchases.manage",
  "dte.manage",
  "accounts_payable.manage",
  "payments.approve",
  "payments.generate_file",
  "reports.export",
  "users.manage",
  "audit.read"
];
const missingPermissions = requiredPermissions.filter(
  (permission) => !permissions.includes(permission)
);

if (missingPermissions.length > 0) {
  throw new Error(`Missing permissions: ${missingPermissions.join(", ")}`);
}

await supabase.auth.signOut();

console.log(
  JSON.stringify(
    {
      ok: true,
      email: authData.user.email,
      userId: authData.user.id,
      membership: adminMembership,
      permissionCount: permissions.length
    },
    null,
    2
  )
);
