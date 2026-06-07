import { AdminUserRole } from "@prisma/client";

type RoleBadgeProps = {
  role: AdminUserRole;
};

export function RoleBadge({ role }: RoleBadgeProps) {
  const label = role === AdminUserRole.ADMIN ? "Admin" : "Creator";
  return <span className={`role-badge is-${role.toLowerCase()}`.trim()}>{label}</span>;
}
