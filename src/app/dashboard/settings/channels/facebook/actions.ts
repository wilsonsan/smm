"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import {
  clearFacebookOauthDebugResult,
  clearPendingFacebookPageSelection,
  connectFacebookPageFromStoredDiagnostics,
  disconnectFacebookConnection,
  getPendingFacebookPageSelection,
  runStoredFacebookManualPageDiagnostics,
  saveFacebookConnectedPage,
  testFacebookConnection,
} from "@/lib/facebook";
import { getRequestMetadata } from "@/lib/http";
import { saveFacebookAppSecretSetting } from "@/lib/secure-settings";
import {
  saveFacebookAppIdSetting,
  saveFacebookPageLookupSetting,
} from "@/lib/settings";
import { facebookPageIdTestSchema, facebookPageSelectionSchema, facebookSettingsSchema } from "@/lib/validation";

function buildFacebookSettingsHref(
  input?: {
    status?: "success" | "error";
    message?: string;
    returnTo?: string;
  },
) {
  const params = new URLSearchParams();

  if (input?.status) {
    params.set("status", input.status);
  }

  if (input?.message) {
    params.set("message", input.message);
  }

  const suffix = params.toString();
  const basePath = input?.returnTo || "/dashboard/settings/channels/facebook";
  return suffix ? `${basePath}?${suffix}` : basePath;
}

async function writeFacebookAuditLog(input: {
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

export async function saveFacebookSettingsAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const parsed = facebookSettingsSchema.safeParse({
    facebookAppId: formData.get("facebookAppId"),
    facebookAppSecret: formData.get("facebookAppSecret"),
    facebookPageLookupValue: formData.get("facebookPageLookupValue"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsed.success) {
    redirect(
      buildFacebookSettingsHref({
        returnTo:
          typeof formData.get("returnTo") === "string" ? String(formData.get("returnTo")) : undefined,
        status: "error",
        message:
          parsed.error.flatten().fieldErrors.facebookAppId?.[0] ||
          parsed.error.flatten().fieldErrors.facebookAppSecret?.[0] ||
          parsed.error.flatten().fieldErrors.facebookPageLookupValue?.[0] ||
          parsed.error.flatten().fieldErrors.returnTo?.[0] ||
          "Enter valid Facebook settings.",
      }),
    );
  }

  const nextAppSecret = parsed.data.facebookAppSecret.trim();

  try {
    if (nextAppSecret) {
      await saveFacebookAppSecretSetting(nextAppSecret);
    }
  } catch (error) {
    redirect(
      buildFacebookSettingsHref({
        returnTo: parsed.data.returnTo || "/dashboard/settings/channels/facebook",
        status: "error",
        message: error instanceof Error ? error.message : "Facebook App Secret could not be saved.",
      }),
    );
  }

  await saveFacebookAppIdSetting(parsed.data.facebookAppId);
  await saveFacebookPageLookupSetting(parsed.data.facebookPageLookupValue);
  await writeFacebookAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.FACEBOOK_SETTINGS_UPDATED,
    metadata: {
      hasFacebookAppId: Boolean(parsed.data.facebookAppId),
      hasFacebookAppSecret: Boolean(nextAppSecret),
      facebookPageLookupValue: parsed.data.facebookPageLookupValue,
      returnTo: parsed.data.returnTo || "/dashboard/settings/channels/facebook",
    },
  });

  redirect(
    buildFacebookSettingsHref({
      returnTo: parsed.data.returnTo || "/dashboard/settings/channels/facebook",
      status: "success",
      message: "Facebook settings saved.",
    }),
  );
}

export async function selectFacebookPageAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const parsed = facebookPageSelectionSchema.safeParse({
    pageId: formData.get("pageId"),
  });

  if (!parsed.success) {
    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message: parsed.error.flatten().fieldErrors.pageId?.[0] || "Choose a Facebook Page before continuing.",
      }),
    );
  }

  const pendingSelection = await getPendingFacebookPageSelection();
  if (!pendingSelection) {
    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message: "The pending Facebook Page selection expired. Connect again and choose the Page one more time.",
      }),
    );
  }

  const selectedPage = pendingSelection.pages.find((page) => page.id === parsed.data.pageId);
  if (!selectedPage) {
    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message: "The selected Facebook Page is no longer available in this connection flow.",
      }),
    );
  }

  const connectedAccount = await saveFacebookConnectedPage({
    accountId: pendingSelection.accountId,
    accountName: pendingSelection.accountName,
    pageId: selectedPage.id,
    pageName: selectedPage.name,
    pageAccessToken: selectedPage.accessToken,
    pageUrl: selectedPage.link ?? null,
    scopes: pendingSelection.scopes,
    tokenExpiresAt: pendingSelection.tokenExpiresAt ? new Date(pendingSelection.tokenExpiresAt) : null,
  });

  await clearPendingFacebookPageSelection();
  await writeFacebookAuditLog({
    actorAdminUserId: adminUser.id,
    action:
      pendingSelection.mode === "reconnect"
        ? AUDIT_ACTIONS.FACEBOOK_RECONNECT_SUCCEEDED
        : AUDIT_ACTIONS.FACEBOOK_CONNECTED,
    targetId: connectedAccount.id,
    metadata: {
      pageId: selectedPage.id,
      pageName: selectedPage.name,
      scopes: pendingSelection.scopes,
    },
  });

  redirect(
    buildFacebookSettingsHref({
      status: "success",
      message:
        pendingSelection.mode === "reconnect"
          ? `Reconnected Facebook Page: ${selectedPage.name}.`
          : `Connected Facebook Page: ${selectedPage.name}.`,
    }),
  );
}

export async function clearFacebookPendingSelectionAction() {
  await requireAdminUser();
  await clearPendingFacebookPageSelection();

  redirect(buildFacebookSettingsHref());
}

export async function clearFacebookDebugResultAction() {
  await requireAdminUser();
  await clearFacebookOauthDebugResult();

  redirect(buildFacebookSettingsHref());
}

export async function runFacebookPageIdDiagnosticsAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const parsed = facebookPageIdTestSchema.safeParse({
    pageId: formData.get("pageId"),
  });

  if (!parsed.success) {
    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message: parsed.error.flatten().fieldErrors.pageId?.[0] || "Enter a valid Facebook Page ID.",
      }),
    );
  }

  try {
    await runStoredFacebookManualPageDiagnostics({
      pageId: parsed.data.pageId,
    });

    await writeFacebookAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.FACEBOOK_CONNECTION_TESTED,
      metadata: {
        mode: "manual_page_id_diagnostic",
        pageId: parsed.data.pageId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook Page ID diagnostics failed.";
    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message,
      }),
    );
  }

  redirect(
    buildFacebookSettingsHref({
      status: "success",
      message: `Facebook diagnostics completed for Page ID ${parsed.data.pageId}. Review the results below.`,
    }),
  );
}

export async function connectFacebookResolvedPageAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const parsed = facebookPageIdTestSchema.safeParse({
    pageId: formData.get("pageId"),
  });

  if (!parsed.success) {
    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message: parsed.error.flatten().fieldErrors.pageId?.[0] || "Enter a valid Facebook Page ID before connecting it.",
      }),
    );
  }

  try {
    const result = await connectFacebookPageFromStoredDiagnostics({
      pageId: parsed.data.pageId,
    });

    await writeFacebookAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.FACEBOOK_CONNECTED,
      targetId: result.connectedAccount.id,
      metadata: {
        mode: "manual_page_connect",
        pageId: result.resolvedPage.pageId,
        pageName: result.resolvedPage.pageName,
        tokenSource: result.resolvedPage.tokenSource,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connecting the Facebook Page from diagnostics failed.";
    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message,
      }),
    );
  }

  redirect(
    buildFacebookSettingsHref({
      status: "success",
      message: `Connected Facebook Page from manual lookup.`,
    }),
  );
}

export async function disconnectFacebookAction() {
  const adminUser = await requireAdminUser();
  const disconnectedAccount = await disconnectFacebookConnection();
  await clearPendingFacebookPageSelection();

  if (disconnectedAccount) {
    await writeFacebookAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.FACEBOOK_DISCONNECTED,
      targetId: disconnectedAccount.id,
    });
  }

  redirect(
    buildFacebookSettingsHref({
      status: "success",
      message: "Facebook connection removed.",
    }),
  );
}

export async function testFacebookConnectionAction() {
  const adminUser = await requireAdminUser();

  try {
    const result = await testFacebookConnection();
    await writeFacebookAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.FACEBOOK_CONNECTION_TESTED,
      metadata: {
        pageId: result.pageId,
        pageName: result.pageName,
        pageUrl: result.pageUrl,
      },
    });

    redirect(
      buildFacebookSettingsHref({
        status: "success",
        message: `Facebook connection test succeeded for ${result.pageName}.`,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook connection test failed.";
    await writeFacebookAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.FACEBOOK_CONNECTION_TEST_FAILED,
      metadata: {
        message,
      },
    });

    redirect(
      buildFacebookSettingsHref({
        status: "error",
        message,
      }),
    );
  }
}
