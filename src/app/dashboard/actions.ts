"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/session";
import { logoutCurrentAdmin } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/notifications";

export async function logoutAction() {
  await logoutCurrentAdmin();
  redirect("/login");
}

export async function openNotificationAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  const notificationId = String(formData.get("notificationId") || "").trim();
  const actionUrl = String(formData.get("actionUrl") || "").trim();

  if (!notificationId) {
    redirect(actionUrl || "/dashboard");
  }

  await markNotificationRead({
    notificationId,
    actorAdminUserId: adminUser.id,
  });

  revalidatePath("/dashboard", "layout");
  redirect(actionUrl || "/dashboard");
}
