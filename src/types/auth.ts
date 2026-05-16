export type AppRole =
  | "owner"
  | "admin"
  | "finance_manager"
  | "accountant"
  | "procurement_manager"
  | "buyer"
  | "store_manager"
  | "auditor";

export type MembershipStatus = "active" | "invited" | "suspended";

export type UserMembership = {
  id: string;
  tenant_id: string;
  company_id: string | null;
  branch_id: string | null;
  user_id: string;
  role: AppRole;
  status: MembershipStatus;
};

export type CurrentProfile = {
  id: string;
  full_name: string | null;
  email: string;
  default_tenant_id: string | null;
};

export type CurrentUserContext = {
  userId: string;
  email: string | null;
  profile: CurrentProfile | null;
  memberships: UserMembership[];
};
