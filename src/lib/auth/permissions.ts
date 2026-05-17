import type { AppRole } from "@/types/auth";

export type PermissionCode =
  | "dashboard.read"
  | "suppliers.manage"
  | "products.manage"
  | "purchases.manage"
  | "dte.manage"
  | "accounts_payable.manage"
  | "payments.approve"
  | "payments.generate_file"
  | "reports.export"
  | "users.manage"
  | "audit.read";

export const ROLE_PERMISSIONS: Record<AppRole, PermissionCode[]> = {
  owner: [
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
  ],
  admin: [
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
  ],
  finance_manager: [
    "dashboard.read",
    "accounts_payable.manage",
    "payments.approve",
    "payments.generate_file",
    "reports.export"
  ],
  accountant: [
    "dashboard.read",
    "dte.manage",
    "accounts_payable.manage",
    "reports.export"
  ],
  procurement_manager: [
    "dashboard.read",
    "suppliers.manage",
    "products.manage",
    "purchases.manage"
  ],
  buyer: ["dashboard.read", "purchases.manage"],
  store_manager: ["dashboard.read", "purchases.manage"],
  auditor: ["dashboard.read", "reports.export", "audit.read"]
};

export function roleHasPermission(role: AppRole, permission: PermissionCode) {
  return ROLE_PERMISSIONS[role].includes(permission);
}
