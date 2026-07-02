import { MetaReviewDemo } from "@/components/meta-review-demo";
import { requireAdminUser } from "@/lib/auth/session";
import { getInstagramDiagnostics } from "@/lib/instagram";
import { getBrandingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function MetaReviewDemoPage() {
  await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "MetaReviewDemoPage",
  });

  const [branding, diagnostics] = await Promise.all([
    getBrandingSettings(),
    getInstagramDiagnostics({ refreshHealth: true }),
  ]);

  const pageName = diagnostics.connectedPage.pageName || diagnostics.foundation.pageName || branding.siteName;
  const username =
    diagnostics.lastTestResult.accountDetails?.username ||
    diagnostics.foundation.username ||
    "yourbusiness";
  const profilePictureUrl =
    diagnostics.lastTestResult.accountDetails?.profilePictureUrl ||
    diagnostics.foundation.profilePictureUrl ||
    null;

  return (
    <MetaReviewDemo
      siteName={branding.siteName}
      account={{
        pageName,
        username,
        profilePictureUrl,
        status: diagnostics.foundation.status,
        isReady: diagnostics.foundation.status === "READY",
        missingScopes: diagnostics.missingScopes,
      }}
    />
  );
}
