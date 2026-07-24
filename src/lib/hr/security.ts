import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/session";

export const HR_ALLOWED_ROLES = ["owner", "admin", "finance_manager"] as const;

export type HrAllowedRole = typeof HR_ALLOWED_ROLES[number];

export type HrServerContext = {
  companyId: string;
  role: HrAllowedRole;
  tenantId: string;
  userId: string;
};

export function isHrAllowedRole(role: string | null | undefined): role is HrAllowedRole {
  return HR_ALLOWED_ROLES.includes(role as HrAllowedRole);
}

export async function requireHrServerContext(): Promise<HrServerContext> {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login?error=session-required");

  const membership = context.memberships.find((item) => item.status === "active" && isHrAllowedRole(item.role));
  if (!membership) redirect("/login?error=hr-forbidden");
  if (!membership.tenant_id || !membership.company_id) redirect("/login?error=hr-context-invalid");

  return {
    companyId: membership.company_id,
    role: membership.role as HrAllowedRole,
    tenantId: membership.tenant_id,
    userId: context.userId
  };
}
