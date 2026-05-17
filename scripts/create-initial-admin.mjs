import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !adminEmail || !adminPassword) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const tenantPayload = {
  name: "La Cocina de Javier",
  slug: "la-cocina-de-javier"
};

const { data: tenant, error: tenantError } = await supabase
  .from("tenants")
  .upsert(tenantPayload, { onConflict: "slug" })
  .select("id")
  .single();

if (tenantError) {
  throw tenantError;
}

const { data: company, error: companyError } = await supabase
  .from("companies")
  .upsert(
    {
      tenant_id: tenant.id,
      legal_name: "La Cocina de Javier",
      trade_name: "La Cocina de Javier",
      rut: "71068862-0",
      giro: "Servicios gastronomicos",
      sii_email: "dte@lacocinadejavier.cl"
    },
    { onConflict: "tenant_id,rut" }
  )
  .select("id")
  .single();

if (companyError) {
  throw companyError;
}

const { data: branch, error: branchError } = await supabase
  .from("branches")
  .upsert(
    {
      tenant_id: tenant.id,
      company_id: company.id,
      name: "Casa Matriz",
      code: "MATRIZ",
      is_active: true
    },
    { onConflict: "company_id,code" }
  )
  .select("id")
  .single();

if (branchError) {
  throw branchError;
}

const { data: usersList, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000
});

if (listError) {
  throw listError;
}

const existingUser = usersList.users.find(
  (user) => user.email?.toLowerCase() === adminEmail.toLowerCase()
);

const { data: userData, error: userError } = existingUser
  ? await supabase.auth.admin.updateUserById(existingUser.id, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Administrador La Cocina de Javier"
      }
    })
  : await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Administrador La Cocina de Javier"
      }
    });

if (userError || !userData.user) {
  throw userError ?? new Error("Admin user was not created.");
}

const userId = userData.user.id;

const { error: profileError } = await supabase.from("profiles").upsert({
  id: userId,
  full_name: "Administrador La Cocina de Javier",
  email: adminEmail.toLowerCase(),
  default_tenant_id: tenant.id
});

if (profileError) {
  throw profileError;
}

const { error: membershipError } = await supabase
  .from("user_memberships")
  .upsert(
    {
      tenant_id: tenant.id,
      company_id: company.id,
      branch_id: branch.id,
      user_id: userId,
      role: "admin",
      status: "active"
    },
    { onConflict: "tenant_id,company_id,branch_id,user_id,role" }
  );

if (membershipError) {
  throw membershipError;
}

const { error: auditError } = await supabase.from("audit_events").insert({
  tenant_id: tenant.id,
  company_id: company.id,
  branch_id: branch.id,
  actor_user_id: userId,
  actor_role: "admin",
  event_type: "auth.initial_admin_upserted",
  entity_type: "user",
  entity_id: userId,
  after_data: {
    email: adminEmail.toLowerCase(),
    role: "admin"
  }
});

if (auditError) {
  throw auditError;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      email: adminEmail.toLowerCase(),
      role: "admin",
      tenant: tenantPayload.slug,
      companyId: company.id,
      branchId: branch.id
    },
    null,
    2
  )
);
