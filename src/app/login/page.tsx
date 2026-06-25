import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentAdminUser, getCurrentPendingMfaSession } from "@/lib/auth/session";
import { getBrandingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const adminUser = await getCurrentAdminUser();
  const pendingMfaSession = await getCurrentPendingMfaSession();
  const branding = await getBrandingSettings();

  if (adminUser) {
    redirect("/dashboard");
  }

  if (pendingMfaSession) {
    redirect("/login/mfa");
  }

  return (
    <main className="login-shell">
      <section className="panel login-card">
        <h2>{branding.siteName}</h2>
        <p>
          Sign in with your account email and password. The environment bootstrap only creates the very first admin on
          a brand-new install.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
