import { AccountMfaCard } from "@/components/account-mfa-card";
import { AccountPasswordForm } from "@/components/account-password-form";
import { AccountProfileForm } from "@/components/account-profile-form";
import { LockIcon, ShieldIcon, UserIcon } from "@/components/dashboard-icons";
import { buildMfaQrCodeDataUrl, decryptMfaSecret, formatManualSetupKey } from "@/lib/auth/mfa";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getBrandingSettings } from "@/lib/settings";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

export default async function AccountPage() {
  const adminUser = await requireAuthenticatedUser();
  const timezone = await getResolvedAppTimezone();
  const branding = await getBrandingSettings();
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
      mfaEnabled: true,
      mfaSecretEncrypted: true,
      mfaVerifiedAt: true,
    },
  });

  if (!currentUser) {
    throw new Error("Authenticated account could not be found.");
  }

  let qrCodeDataUrl: string | null = null;
  let manualKey: string | null = null;
  if (!currentUser.mfaEnabled && currentUser.mfaSecretEncrypted) {
    try {
      const secret = await decryptMfaSecret(currentUser.mfaSecretEncrypted);
      manualKey = formatManualSetupKey(secret);
      qrCodeDataUrl = await buildMfaQrCodeDataUrl({
        secret,
        accountName: currentUser.email,
        issuer: branding.siteName,
      });
    } catch {
      qrCodeDataUrl = null;
      manualKey = null;
    }
  }

  return (
    <section className="account-settings-shell">
      <header className="account-settings-hero">
        <div className="account-settings-hero-copy">
          <h1>Account Settings</h1>
          <p>Manage your profile, security, and account preferences.</p>
        </div>
        <div className="account-settings-hero-emblem" aria-hidden="true">
          <div className="account-settings-hero-shield">
            <ShieldIcon />
          </div>
          <div className="account-settings-hero-lock">
            <LockIcon />
          </div>
        </div>
      </header>

      <section className="account-settings-grid">
        <article className="account-settings-card account-settings-profile-card">
          <div className="account-settings-card-head">
            <div className="account-settings-card-icon">
              <UserIcon />
            </div>
            <div>
              <h2>Profile</h2>
              <p>Manage your username and account email from the database-backed profile.</p>
            </div>
          </div>
          <AccountProfileForm
            username={currentUser.username}
            email={currentUser.email}
            role={currentUser.role}
            createdAtLabel={formatDateTimeForTimezone(currentUser.createdAt, timezone)}
          />
        </article>

        <article className="account-settings-card account-settings-security-card">
          <div className="account-settings-card-head">
            <div className="account-settings-card-icon">
              <ShieldIcon />
            </div>
            <div>
              <h2>Security</h2>
              <p>Update your password without touching environment variables or restarting the app.</p>
            </div>
          </div>
          <AccountPasswordForm />
        </article>

        <article className="account-settings-card account-settings-mfa-card">
          <AccountMfaCard
            isEnabled={currentUser.mfaEnabled}
            enabledAtLabel={
              currentUser.mfaVerifiedAt ? formatDateTimeForTimezone(currentUser.mfaVerifiedAt, timezone) : null
            }
            hasPendingSetup={Boolean(!currentUser.mfaEnabled && currentUser.mfaSecretEncrypted)}
            qrCodeDataUrl={qrCodeDataUrl}
            manualKey={manualKey}
          />
        </article>
      </section>
    </section>
  );
}
