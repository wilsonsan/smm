import { requireAuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";
import { AccountPasswordForm } from "@/components/account-password-form";
import { AccountProfileForm } from "@/components/account-profile-form";
import { RoleBadge } from "@/components/role-badge";

export default async function AccountPage() {
  const adminUser = await requireAuthenticatedUser();
  const timezone = await getResolvedAppTimezone();
  const currentUser = await prisma.adminUser.findUnique({
    where: {
      id: adminUser.id,
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  if (!currentUser) {
    throw new Error("Authenticated account could not be found.");
  }

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Account Settings</h2>
          <p>Manage your own profile, password, and core account details.</p>
        </div>
      </header>

      <section className="grid-2">
        <article className="panel form-card">
          <div className="section-stack">
            <div>
              <h2 style={{ fontSize: "1.35rem", marginBottom: 8 }}>Profile</h2>
              <p className="muted">Update the username and email address used for this account.</p>
            </div>

            <AccountProfileForm username={currentUser.username} email={currentUser.email} />
          </div>
        </article>

        <article className="panel form-card">
          <div className="section-stack">
            <div>
              <h2 style={{ fontSize: "1.35rem", marginBottom: 8 }}>Security</h2>
              <p className="muted">Change your password securely after verifying your current one.</p>
            </div>

            <AccountPasswordForm />
          </div>
        </article>
      </section>

      <section className="grid-2">
        <article className="panel form-card">
          <div className="section-stack">
            <div>
              <h2 style={{ fontSize: "1.35rem", marginBottom: 8 }}>Account Information</h2>
              <p className="muted">Read-only details for this account and the current sign-in lifecycle.</p>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Role</label>
                <div>
                  <RoleBadge role={currentUser.role} />
                </div>
              </div>

              <div className="field">
                <label>Created Date</label>
                <input value={formatDateTimeForTimezone(currentUser.createdAt, timezone)} readOnly />
              </div>

              <div className="field">
                <label>Last Login</label>
                <input
                  value={
                    currentUser.lastLoginAt
                      ? formatDateTimeForTimezone(currentUser.lastLoginAt, timezone)
                      : "Not available yet"
                  }
                  readOnly
                />
              </div>
            </div>
          </div>
        </article>

        <article className="panel form-card">
          <div className="section-stack">
            <div>
              <h2 style={{ fontSize: "1.35rem", marginBottom: 8 }}>Future Settings</h2>
              <p className="muted">
                This area is structured to grow later with theme preferences, notifications, multi-user management, and
                two-factor authentication.
              </p>
            </div>

            <div className="settings-subcard">
              <div className="settings-subcard-head">
                <div>
                  <strong>Reserved for future account controls</strong>
                  <p>Theme preferences, notification preferences, multi-user management, and 2FA will land here later.</p>
                </div>
                <span className="settings-chip">Future-ready</span>
              </div>
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
