"use server";

import { requireAdminUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";
import { saveAppSettings } from "@/lib/settings";
import { initialFormState, settingsSchema, type FormState } from "@/lib/validation";

export async function saveSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAdminUser();
  const parsed = settingsSchema.safeParse({
    publicAppUrl: formData.get("publicAppUrl"),
    uploadDirectory: formData.get("uploadDirectory"),
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

