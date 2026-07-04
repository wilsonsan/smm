"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser, requireAuthenticatedUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { isProduction } from "@/lib/env";
import { getRequestMetadata } from "@/lib/http";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import {
  getHashtagSettings,
  getInsertContentTemplateSettings,
  saveAppSettings,
  saveDeveloperSettings,
  saveHashtagSettings,
  saveInsertContentTemplateSettings,
} from "@/lib/settings";
import { clearStoredGalleryLibrary } from "@/lib/uploads";
import {
  developerSettingsSchema,
  galleryDeletionSchema,
  hashtagGroupEditorSchema,
  hashtagSettingsSchema,
  insertContentTemplatesSchema,
  initialFormState,
  settingsSchema,
  type FormState,
} from "@/lib/validation";

async function enforceSettingsRateLimit(adminUserId: string, attemptedAction: string) {
  const { ipAddress, userAgent } = await getRequestMetadata();
  await enforceRateLimit(RATE_LIMITS.api.settings, {
    actorAdminUserId: adminUserId,
    userId: adminUserId,
    ipAddress,
    userAgent,
    endpoint: "/dashboard/settings",
    method: "SERVER_ACTION",
    attemptedAction,
  });
}

export async function saveSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdminUser();
  try {
    await enforceSettingsRateLimit(adminUser.id, "save_site_settings");
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return {
        ...initialFormState,
        message: error.message,
      };
    }

    throw error;
  }
  const parsed = settingsSchema.safeParse({
    siteName: formData.get("siteName"),
    siteFaviconUrl: formData.get("siteFaviconUrl"),
    publicAppUrl: formData.get("publicAppUrl"),
    uploadDirectory: formData.get("uploadDirectory"),
    appTimezone: formData.get("appTimezone"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted settings fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await saveAppSettings(parsed.data);

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    targetType: "AppSetting",
    ipAddress,
    userAgent,
    metadata: parsed.data,
  });

  return {
    success: true,
    message: "Settings saved.",
  };
}

export async function saveInsertContentTemplatesAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  try {
    await enforceSettingsRateLimit(adminUser.id, "save_insert_content_templates");
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return {
        ...initialFormState,
        message: error.message,
      };
    }

    throw error;
  }
  const previousTemplates = await getInsertContentTemplateSettings();
  const parsed = insertContentTemplatesSchema.safeParse({
    signature: formData.get("signature"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email"),
    website: formData.get("website"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the Insert Content fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await saveInsertContentTemplateSettings(parsed.data);

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.INSERT_CONTENT_TEMPLATES_UPDATED,
    targetType: "AppSetting",
    ipAddress,
    userAgent,
    metadata: {
      previousTemplates,
      nextTemplates: parsed.data,
    },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/insert-content");
  revalidatePath("/dashboard/posts/new");
  revalidatePath("/dashboard/posts");

  return {
    success: true,
    message: "Insert Content saved.",
  };
}

export async function clearGalleryLibraryAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "DeletionSettingsPage",
  });
  try {
    await enforceSettingsRateLimit(adminUser.id, "clear_gallery_library");
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return {
        ...initialFormState,
        message: error.message,
      };
    }

    throw error;
  }
  const parsed = galleryDeletionSchema.safeParse({
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Type CLEAR GALLERY to confirm the reset.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const summary = await clearStoredGalleryLibrary();
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.GALLERY_CLEARED,
    targetType: "MediaAsset",
    ipAddress,
    userAgent,
    metadata: summary,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/media");
  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard/posts/new");
  revalidatePath("/dashboard/settings/deletion");

  return {
    success: true,
    message:
      summary.failedFileDeleteCount > 0
        ? `Gallery cleared. Removed ${summary.deletedMediaAssetCount} saved items, deleted ${summary.deletedFileCount} files, missed ${summary.missingFileCount} already-missing files, and left ${summary.failedFileDeleteCount} files on disk that could not be removed.`
        : `Gallery cleared. Removed ${summary.deletedMediaAssetCount} saved items, deleted ${summary.deletedFileCount} files, and skipped ${summary.missingFileCount} already-missing files.`,
  };
}

export async function saveDeveloperSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
  if (isProduction) {
    return {
      ...initialFormState,
      message: "Developer overrides are unavailable in production.",
    };
  }

  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "DeveloperSettingsPage",
  });
  try {
    await enforceSettingsRateLimit(adminUser.id, "save_developer_settings");
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return {
        ...initialFormState,
        message: error.message,
      };
    }

    throw error;
  }
  const parsed = developerSettingsSchema.safeParse({
    facebook: formData.get("facebook"),
    instagram: formData.get("instagram"),
    google: formData.get("google"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the developer override settings and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await saveDeveloperSettings(parsed.data);

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.DEVELOPER_SETTINGS_UPDATED,
    targetType: "AppSetting",
    ipAddress,
    userAgent,
    metadata: parsed.data,
  });

  revalidatePath("/dashboard/posts/new");
  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard/settings/developer");

  return {
    success: true,
    message: "Developer overrides saved.",
  };
}

export async function saveHashtagSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  try {
    await enforceSettingsRateLimit(adminUser.id, "save_hashtag_settings");
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return {
        ...initialFormState,
        message: error.message,
      };
    }

    throw error;
  }
  const previousSettings = await getHashtagSettings();
  const parsed = hashtagSettingsSchema.safeParse({
    facebookDefaultLimit: formData.get("facebookDefaultLimit"),
    groupsJson: formData.get("groupsJson"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the hashtag settings and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let nextGroups;
  try {
    nextGroups = hashtagGroupEditorSchema.parse(JSON.parse(parsed.data.groupsJson));
  } catch {
    return {
      ...initialFormState,
      message: "Fix the hashtag groups and try again.",
      fieldErrors: {
        groupsJson: ["Hashtag groups could not be parsed."],
      },
    };
  }

  await saveHashtagSettings({
    facebookDefaultLimit: parsed.data.facebookDefaultLimit,
    groups: nextGroups,
  });

  const { ipAddress, userAgent } = await getRequestMetadata();
  const previousGroupMap = new Map(previousSettings.groups.map((group) => [group.id, group]));
  const nextGroupMap = new Map(nextGroups.map((group) => [group.id, group]));

  for (const group of nextGroups) {
    const previousGroup = previousGroupMap.get(group.id);
    if (!previousGroup) {
      await createAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.HASHTAG_GROUP_MODIFIED,
        targetType: "HashtagGroup",
        targetId: group.id,
        ipAddress,
        userAgent,
        metadata: {
          changeType: "created",
          group,
        },
      });
      continue;
    }

    if (
      previousGroup.name !== group.name ||
      JSON.stringify(previousGroup.hashtags) !== JSON.stringify(group.hashtags)
    ) {
      await createAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.HASHTAG_GROUP_MODIFIED,
        targetType: "HashtagGroup",
        targetId: group.id,
        ipAddress,
        userAgent,
        metadata: {
          changeType: "updated",
          previousGroup,
          nextGroup: group,
        },
      });
    }
  }

  for (const group of previousSettings.groups) {
    if (nextGroupMap.has(group.id)) {
      continue;
    }

    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.HASHTAG_GROUP_MODIFIED,
      targetType: "HashtagGroup",
      targetId: group.id,
      ipAddress,
      userAgent,
      metadata: {
        changeType: "deleted",
        group,
      },
    });
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/hashtags");
  revalidatePath("/dashboard/posts/new");

  return {
    success: true,
    message: "Hashtag settings saved.",
  };
}
