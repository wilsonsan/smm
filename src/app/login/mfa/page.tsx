import { redirect } from "next/navigation";
import { LoginMfaForm } from "@/components/login-mfa-form";
import { getCurrentAdminUser, getCurrentPendingMfaSession } from "@/lib/auth/session";
import { getBrandingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LoginMfaPage() {
  const [adminUser, pendingMfaSession, branding] = await Promise.all([
    getCurrentAdminUser(),
    getCurrentPendingMfaSession(),
    getBrandingSettings(),
  ]);

  if (adminUser) {
    redirect("/dashboard");
  }

  if (!pendingMfaSession) {
    redirect("/login");
  }

  return (
    <main className="login-shell">
      <section className="panel login-card">
        <h2>{branding.siteName}</h2>
        <p>Multi-factor authentication is enabled for this account. Enter your authenticator code to finish signing in.</p>
        <LoginMfaForm />
      </section>
    </main>
  );
}
