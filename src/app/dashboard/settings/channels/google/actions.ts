"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import {
  clearPendingGoogleLocationSelection,
  connectGoogleSelectedLocation,
  disconnectGoogleConnection,
  getGoogleDiagnostics,
  testGoogleConnection,
} from "@/lib/google";
import { getRequestMetadata } from "@/lib/http";
import { rotateTokenEncryptionKeySetting, saveGoogleClientSecretSetting } from "@/lib/secure-settings";
import { saveGoogleClientIdSetting } from "@/lib/settings";
import { googleLocationSelectionSchema, googleSettingsSchema } from "@/lib/validation";

function buildGoogleSettingsHref(input?: {
  status?: "success" | "error";
  message?: string;
  returnTo?: string;
}) {
  const params = new URLSearchParams();

  if (input?.status) {
    params.set("status", input.status);
  }

  if (input?.message) {
    params.set("message", input.message);
  }

  const suffix = params.toString();
  const basePath = input?.returnTo || "/dashboard/settings/channels/google";
  return suffix ? `${basePath}?${suffix}` : basePath;
}

async function writeGoogleAuditLog(input: {
  action: string;
  actorAdminUserId: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const { ipAddress, userAgent } = await getRequestMetadata();

  await createAuditLog({
    actorAdminUserId: input.actorAdminUserId,
    action: input.action,
    targetType: "ConnectedAccount",
    targetId: input.targetId ?? null,
    ipAddress,
    userAgent,
    metadata: input.metadata,
  });
}

export async function saveGoogleSettingsAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const parsed = googleSettingsSchema.safeParse({
    googleClientId: formData.get("googleClientId"),
    googleClientSecret: formData.get("googleClientSecret"),
    tokenEncryptionKey: formData.get("tokenEncryptionKey"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsed.success) {
    redirect(
      buildGoogleSettingsHref({
        returnTo: typeof formData.get("returnTo") === "string" ? String(formData.get("returnTo")) : undefined,
        status: "error",
        message:
          parsed.error.flatten().fieldErrors.googleClientId?.[0] ||
          parsed.error.flatten().fieldErrors.googleClientSecret?.[0] ||
          parsed.error.flatten().fieldErrors.tokenEncryptionKey?.[0] ||
          parsed.error.flatten().fieldErrors.returnTo?.[0] ||
          "Enter valid Google Business settings.",
      }),
    );
  }

  const nextClientSecret = parsed.data.googleClientSecret.trim();
  const nextTokenEncryptionKey = parsed.data.tokenEncryptionKey.trim();

  try {
    if (nextTokenEncryptionKey) {
      await rotateTokenEncryptionKeySetting(nextTokenEncryptionKey);
    }

    if (nextClientSecret) {
      await saveGoogleClientSecretSetting(nextClientSecret);
    }
  } catch (error) {
    redirect(
      buildGoogleSettingsHref({
        returnTo: parsed.data.returnTo || "/dashboard/settings/channels/google",
        status: "error",
        message: error instanceof Error ? error.message : "Google Client Secret could not be saved.",
      }),
    );
  }

  await saveGoogleClientIdSetting(parsed.data.googleClientId);
  await writeGoogleAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.GOOGLE_SETTINGS_UPDATED,
    metadata: {
      hasGoogleClientId: Boolean(parsed.data.googleClientId),
      hasGoogleClientSecret: Boolean(nextClientSecret),
      hasTokenEncryptionKey: Boolean(nextTokenEncryptionKey),
      returnTo: parsed.data.returnTo || "/dashboard/settings/channels/google",
    },
  });

  redirect(
    buildGoogleSettingsHref({
      returnTo: parsed.data.returnTo || "/dashboard/settings/channels/google",
      status: "success",
      message: "Google Business settings saved.",
    }),
  );
}

export async function selectGoogleLocationAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const parsed = googleLocationSelectionSchema.safeParse({
    locationName: formData.get("locationName"),
  });

  if (!parsed.success) {
    redirect(
      buildGoogleSettingsHref({
        status: "error",
        message:
          parsed.error.flatten().fieldErrors.locationName?.[0] ||
          "Choose a Google Business Profile location before continuing.",
      }),
    );
  }

  try {
    const result = await connectGoogleSelectedLocation(parsed.data.locationName);

    await writeGoogleAuditLog({
      actorAdminUserId: adminUser.id,
      action:
        result.mode === "reconnect"
          ? AUDIT_ACTIONS.GOOGLE_RECONNECT_SUCCEEDED
          : AUDIT_ACTIONS.GOOGLE_CONNECTED,
      targetId: result.connection.id,
      metadata: {
        locationId: result.location.locationId,
        locationName: result.location.title,
        accountResourceName: result.location.accountResourceName,
      },
    });

    redirect(
      buildGoogleSettingsHref({
        status: "success",
        message:
          result.mode === "reconnect"
            ? `Reconnected Google Business location: ${result.location.title}.`
            : `Connected Google Business location: ${result.location.title}.`,
      }),
    );
  } catch (error) {
    redirect(
      buildGoogleSettingsHref({
        status: "error",
        message: error instanceof Error ? error.message : "Google Business location selection failed.",
      }),
    );
  }
}

export async function clearGooglePendingSelectionAction() {
  await requireAdminUser();
  await clearPendingGoogleLocationSelection();
  redirect(buildGoogleSettingsHref());
}

export async function disconnectGoogleAction() {
  const adminUser = await requireAdminUser();
  const disconnected = await disconnectGoogleConnection();

  if (disconnected) {
    await writeGoogleAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.GOOGLE_DISCONNECTED,
      targetId: disconnected.id,
    });
  }

  redirect(
    buildGoogleSettingsHref({
      status: "success",
      message: "Google Business connection removed.",
    }),
  );
}

export async function testGoogleConnectionAction() {
  const adminUser = await requireAdminUser();

  try {
    const result = await testGoogleConnection();
    await writeGoogleAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.GOOGLE_CONNECTION_TESTED,
      metadata: {
        locationId: result.locationId,
        locationName: result.locationName,
      },
    });

    redirect(
      buildGoogleSettingsHref({
        status: "success",
        message: `Google Business connection test succeeded for ${result.locationName}.`,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Business connection test failed.";
    await writeGoogleAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.GOOGLE_CONNECTION_TEST_FAILED,
      metadata: {
        message,
      },
    });

    redirect(
      buildGoogleSettingsHref({
        status: "error",
        message,
      }),
    );
  }
}

export async function testGoogleConnectionAdvancedAction() {
  await requireAdminUser();
  const diagnostics = await getGoogleDiagnostics({ refreshHealth: true });

  redirect(
    buildGoogleSettingsHref({
      returnTo: "/dashboard/settings/channels/google/advanced",
      status: diagnostics.lastTest.success ? "success" : "error",
      message: diagnostics.lastTest.message,
    }),
  );
}
