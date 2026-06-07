"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  accountProfileSchema,
  initialFormState,
  passwordChangeSchema,
  type FormState,
} from "@/lib/validation";

export async function updateAccountProfileAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  const parsed = accountProfileSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted account fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const username = parsed.data.username.trim().toLowerCase();
  const email = parsed.data.email.trim().toLowerCase();

  const [usernameConflict, emailConflict] = await Promise.all([
    prisma.adminUser.findFirst({
      where: {
        username,
        NOT: {
          id: adminUser.id,
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.adminUser.findFirst({
      where: {
        email,
        NOT: {
          id: adminUser.id,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  const fieldErrors: Record<string, string[] | undefined> = {};
  if (usernameConflict) {
    fieldErrors.username = ["That username is already in use."];
  }

  if (emailConflict) {
    fieldErrors.email = ["That email address is already in use."];
  }

  if (fieldErrors.username || fieldErrors.email) {
    return {
      ...initialFormState,
      message: "Choose a different username or email address.",
      fieldErrors,
    };
  }

  const existingUser = await prisma.adminUser.findUnique({
    where: {
      id: adminUser.id,
    },
    select: {
      username: true,
      email: true,
    },
  });

  if (!existingUser) {
    return {
      ...initialFormState,
      message: "Your account could not be found.",
    };
  }

  await prisma.adminUser.update({
    where: {
      id: adminUser.id,
    },
    data: {
      username,
      email,
      displayName: username,
    },
  });

  const { ipAddress, userAgent } = await getRequestMetadata();
  if (existingUser.username !== username) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.ACCOUNT_USERNAME_UPDATED,
      targetType: "AdminUser",
      targetId: adminUser.id,
      ipAddress,
      userAgent,
      metadata: {
        previousUsername: existingUser.username,
        nextUsername: username,
      },
    });
  }

  if (existingUser.email !== email) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.ACCOUNT_EMAIL_UPDATED,
      targetType: "AdminUser",
      targetId: adminUser.id,
      ipAddress,
      userAgent,
      metadata: {
        previousEmail: existingUser.email,
        nextEmail: email,
      },
    });
  }

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard");
  return {
    success: true,
    message: "Account profile updated.",
  };
}

export async function changePasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmNewPassword: formData.get("confirmNewPassword"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted password fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existingUser = await prisma.adminUser.findUnique({
    where: {
      id: adminUser.id,
    },
    select: {
      passwordHash: true,
    },
  });

  if (!existingUser) {
    return {
      ...initialFormState,
      message: "Your account could not be found.",
    };
  }

  const currentPasswordMatches = await bcrypt.compare(parsed.data.currentPassword, existingUser.passwordHash);
  if (!currentPasswordMatches) {
    return {
      ...initialFormState,
      message: "Current password is incorrect.",
      fieldErrors: {
        currentPassword: ["Current password is incorrect."],
      },
    };
  }

  const nextPasswordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.adminUser.update({
    where: {
      id: adminUser.id,
    },
    data: {
      passwordHash: nextPasswordHash,
    },
  });

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED_BY_SELF,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
  });

  return {
    success: true,
    message: "Password updated.",
  };
}
