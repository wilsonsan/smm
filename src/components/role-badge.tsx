import { AdminUserRole } from "@prisma/client";

type RoleBadgeProps = {
  role: AdminUserRole;
};

export function RoleBadge({ role }: RoleBadgeProps) {
  return <span className={`role-badge is-${role.toLowerCase()}`.trim()}>{role}</span>;
}
