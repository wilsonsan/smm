import Link from "next/link";
import { UserManagementPanel } from "@/components/user-management-panel";
import { isDeletedArchiveUser } from "@/lib/managed-users";
import { prisma } from "@/lib/prisma";

function sortUsers(
  users: Array<{
    id: string;
    username: string;
    email: string;
    role: "ADMIN" | "CREATOR";
    _count: {
      createdPosts: number;
    };
  }>,
) {
  return [...users].sort((left, right) => {
    const leftKey = left.username || left.email;
    const rightKey = right.username || right.email;
    const primary = leftKey.localeCompare(rightKey, undefined, { sensitivity: "base" });
    if (primary !== 0) {
      return primary;
    }

    return left.email.localeCompare(right.email, undefined, { sensitivity: "base" });
  });
}

export default async function UsersPage() {
  const users = sortUsers(
    (await prisma.adminUser.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        _count: {
          select: {
            createdPosts: true,
          },
        },
      },
    })).filter((user) => !isDeletedArchiveUser(user)),
  ).map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    totalPosts: user._count.createdPosts,
  }));

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Users</h2>
          <p>Manage who can sign in and what role they have.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <UserManagementPanel users={users} />
    </section>
  );
}
