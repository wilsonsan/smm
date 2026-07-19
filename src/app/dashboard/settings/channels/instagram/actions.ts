"use server";

import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { getRequestMetadata } from "@/lib/http";
import { META_INSTAGRAM_UNAVAILABLE_MESSAGE } from "@/lib/meta-instagram-capability";
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

  redirect(
    buildInstagramSettingsHref({
      status: "error",
      message: META_INSTAGRAM_UNAVAILABLE_MESSAGE,
    }),
  );
}
