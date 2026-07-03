"use server";

import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { getInstagramDiagnostics } from "@/lib/instagram";
import { getRequestMetadata } from "@/lib/http";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";

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
  const adminUser = await requireAdminUser();
  const { ipAddress, userAgent } = await getRequestMetadata();

  try {
    await enforceRateLimit(RATE_LIMITS.connectedAccounts.actionsPerHour, {
      actorAdminUserId: adminUser.id,
      userId: adminUser.id,
      ipAddress,
      userAgent,
      endpoint: "/dashboard/settings/channels/instagram",
      method: "SERVER_ACTION",
      attemptedAction: "instagram_test_connection",
    });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      redirect(
        buildInstagramSettingsHref({
          status: "error",
          message: error.message,
        }),
      );
    }

    throw error;
  }

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
