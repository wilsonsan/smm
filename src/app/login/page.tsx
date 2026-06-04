import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentAdminUser } from "@/lib/auth/session";
import { getBrandingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const adminUser = await getCurrentAdminUser();
  const branding = await getBrandingSettings();

  if (adminUser) {
    redirect("/dashboard");
  }

  return (
    <main className="login-shell">
      <section className="panel login-card">
        <h2>{branding.siteName}</h2>
        <p>
          This scheduler is provisioned for internal admin use only. Create the initial admin through the
          environment-backed seed flow before signing in.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
