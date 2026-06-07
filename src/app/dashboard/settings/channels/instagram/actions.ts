"use server";

import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { getInstagramDiagnostics } from "@/lib/instagram";

function buildInstagramSettingsHref(input?: { status?: "success" | "error"; message?: string }) {
  const params = new URLSearchParams();

  if (input?.status) {
    params.set("status", input.status);
  }

  if (input?.message) {
    params.set("message", input.message);
  }

  const suffix = params.toString();
  return suffix ? `/dashboard/settings/channels/instagram?${suffix}` : "/dashboard/settings/channels/instagram";
}

export async function testInstagramConnectionAction() {
  await requireAdminUser();

  const diagnostics = await getInstagramDiagnostics({ refreshHealth: true });

  if (diagnostics.foundation.status === "READY" && diagnostics.lastTestResult.success) {
    redirect(
      buildInstagramSettingsHref({
        status: "success",
        message: `Instagram account test succeeded for ${diagnostics.foundation.username ? `@${diagnostics.foundation.username}` : "the linked account"}.`,
      }),
    );
  }

  redirect(
    buildInstagramSettingsHref({
      status: "error",
      message: diagnostics.lastTestResult.message || diagnostics.foundation.message,
    }),
  );
}
