"use server";

import { redirect } from "next/navigation";
import { hasSupabaseAdminConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing-credentials");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect("/login?error=invalid-credentials");
  }

  if (hasSupabaseAdminConfig() && data.user) {
    const membership = await supabase.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", data.user.id).eq("status", "active").maybeSingle();
    await createAdminClient().from("audit_events").insert({ actor_role: membership.data?.role, actor_user_id: data.user.id, after_data: { email }, company_id: membership.data?.company_id, entity_id: data.user.id, entity_type: "auth_session", event_type: "auth.login", tenant_id: membership.data?.tenant_id });
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (hasSupabaseAdminConfig() && user) {
    const membership = await supabase.from("user_memberships").select("tenant_id,company_id,role").eq("user_id", user.id).eq("status", "active").maybeSingle();
    await createAdminClient().from("audit_events").insert({ actor_role: membership.data?.role, actor_user_id: user.id, after_data: { email: user.email ?? null }, company_id: membership.data?.company_id, entity_id: user.id, entity_type: "auth_session", event_type: "auth.logout", tenant_id: membership.data?.tenant_id });
  }
  await supabase.auth.signOut();
  redirect("/login");
}
