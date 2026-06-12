"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";
import { saveAppSettings } from "@/lib/settings";
import { clearStoredGalleryLibrary } from "@/lib/uploads";
import { galleryDeletionSchema, initialFormState, settingsSchema, type FormState } from "@/lib/validation";

export async function saveSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdminUser();
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

export async function clearGalleryLibraryAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "DeletionSettingsPage",
  });
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
