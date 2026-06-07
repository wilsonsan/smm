"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { AdminUserRole, type Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { initialUserManagementFormState, type UserManagementFormState } from "@/app/dashboard/settings/users/form-state";
import { requireAdminUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";
import {
  DELETED_USER_DISPLAY_NAME,
  DELETED_USER_EMAIL,
  DELETED_USER_SETTING_KEY,
  DELETED_USER_USERNAME,
  isDeletedArchiveUser,
} from "@/lib/managed-users";
import { prisma } from "@/lib/prisma";
import { createUserSchema, updateManagedUserSchema } from "@/lib/validation";

async function getAdminCount() {
  return prisma.adminUser.count({
    where: {
      role: AdminUserRole.ADMIN,
    },
  });
}

async function getOrCreateDeletedUserAccount(tx: Prisma.TransactionClient) {
  const savedDeletedUserId = await tx.appSetting.findUnique({
    where: { key: DELETED_USER_SETTING_KEY },
    select: { value: true },
  });

  if (savedDeletedUserId?.value) {
    const existingById = await tx.adminUser.findUnique({
      where: { id: savedDeletedUserId.value },
    });

    if (existingById) {
      return existingById;
    }
  }

  const fallbackExistingUser = await tx.adminUser.findFirst({
    where: {
      OR: [
        { username: DELETED_USER_USERNAME },
        { email: DELETED_USER_EMAIL },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (fallbackExistingUser) {
    await tx.appSetting.upsert({
      where: { key: DELETED_USER_SETTING_KEY },
      update: { value: fallbackExistingUser.id },
      create: {
        key: DELETED_USER_SETTING_KEY,
        value: fallbackExistingUser.id,
      },
    });

    return fallbackExistingUser;
  }

  const createdDeletedUser = await tx.adminUser.create({
    data: {
      username: DELETED_USER_USERNAME,
      email: DELETED_USER_EMAIL,
      displayName: DELETED_USER_DISPLAY_NAME,
      passwordHash: await bcrypt.hash(`deleted-user-${randomUUID()}`, 12),
      role: AdminUserRole.CREATOR,
    },
  });

  await tx.appSetting.upsert({
    where: { key: DELETED_USER_SETTING_KEY },
    update: { value: createdDeletedUser.id },
    create: {
      key: DELETED_USER_SETTING_KEY,
      value: createdDeletedUser.id,
    },
  });

  return createdDeletedUser;
}

export async function createUserAction(
  _: UserManagementFormState,
  formData: FormData,
): Promise<UserManagementFormState> {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "UsersPage",
  });
  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      ...initialUserManagementFormState,
      message: "Fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const username = parsed.data.username.trim().toLowerCase();
  const email = parsed.data.email.trim().toLowerCase();

  const [existingUsername, existingEmail] = await Promise.all([
    prisma.adminUser.findUnique({
      where: { username },
      select: { id: true },
    }),
    prisma.adminUser.findUnique({
      where: { email },
      select: { id: true },
    }),
  ]);

  if (existingUsername) {
    return {
      ...initialUserManagementFormState,
      message: "That username is already in use.",
      fieldErrors: {
        username: ["That username is already in use."],
      },
    };
  }

  if (existingEmail) {
    return {
      ...initialUserManagementFormState,
      message: "That email address is already in use.",
      fieldErrors: {
        email: ["That email address is already in use."],
      },
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const createdUser = await prisma.adminUser.create({
    data: {
      username,
      email,
      displayName: username,
      passwordHash,
      role: parsed.data.role,
    },
  });

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.USER_CREATED,
    targetType: "AdminUser",
    targetId: createdUser.id,
    ipAddress,
    userAgent,
    metadata: {
      email,
      role: createdUser.role,
    },
  });

  revalidatePath("/dashboard/settings/users");
  return {
    success: true,
    message: "User created successfully.",
  };
}

export async function updateUserAction(
  _: UserManagementFormState,
  formData: FormData,
): Promise<UserManagementFormState> {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "UsersPage",
  });
  const parsed = updateManagedUserSchema.safeParse({
    userId: formData.get("userId"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      ...initialUserManagementFormState,
      message: "Fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const username = parsed.data.username.trim().toLowerCase();
  const email = parsed.data.email.trim().toLowerCase();
  const managedUser = await prisma.adminUser.findUnique({
    where: { id: parsed.data.userId },
  });

  if (!managedUser) {
    return {
      ...initialUserManagementFormState,
      message: "That user no longer exists.",
    };
  }

  const usernameConflict = await prisma.adminUser.findFirst({
    where: {
      username,
      NOT: { id: managedUser.id },
    },
    select: { id: true },
  });

  if (usernameConflict) {
    return {
      ...initialUserManagementFormState,
      message: "That username is already in use.",
      fieldErrors: {
        username: ["That username is already in use."],
      },
    };
  }

  const emailConflict = await prisma.adminUser.findFirst({
    where: {
      email,
      NOT: { id: managedUser.id },
    },
    select: { id: true },
  });

  if (emailConflict) {
    return {
      ...initialUserManagementFormState,
      message: "That email address is already in use.",
      fieldErrors: {
        email: ["That email address is already in use."],
      },
    };
  }

  if (
    managedUser.role === AdminUserRole.ADMIN &&
    parsed.data.role === AdminUserRole.CREATOR
  ) {
    const adminCount = await getAdminCount();
    if (adminCount <= 1) {
      return {
        ...initialUserManagementFormState,
        message: "You cannot demote the last remaining Admin.",
        fieldErrors: {
          role: ["You cannot demote the last remaining Admin."],
        },
      };
    }
  }

  const updateData: {
    username: string;
    email: string;
    displayName: string;
    role: AdminUserRole;
    passwordHash?: string;
  } = {
    username,
    email,
    displayName: username,
    role: parsed.data.role,
  };

  if (parsed.data.password) {
    updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  await prisma.adminUser.update({
    where: { id: managedUser.id },
    data: updateData,
  });

  const { ipAddress, userAgent } = await getRequestMetadata();
  if (managedUser.username !== username) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.USER_USERNAME_CHANGED,
      targetType: "AdminUser",
      targetId: managedUser.id,
      ipAddress,
      userAgent,
      metadata: {
        previousUsername: managedUser.username,
        nextUsername: username,
      },
    });
  }

  if (managedUser.email !== email) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.USER_EMAIL_CHANGED,
      targetType: "AdminUser",
      targetId: managedUser.id,
      ipAddress,
      userAgent,
      metadata: {
        previousEmail: managedUser.email,
        nextEmail: email,
      },
    });
  }

  if (managedUser.role !== parsed.data.role) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      targetType: "AdminUser",
      targetId: managedUser.id,
      ipAddress,
      userAgent,
      metadata: {
        previousRole: managedUser.role,
        nextRole: parsed.data.role,
      },
    });
  }

  if (parsed.data.password) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED_BY_ADMIN,
      targetType: "AdminUser",
      targetId: managedUser.id,
      ipAddress,
      userAgent,
      metadata: {
        changedBySelf: managedUser.id === adminUser.id,
      },
    });
  }

  revalidatePath("/dashboard/settings/users");
  return {
    success: true,
    message: "User updated successfully.",
  };
}

export async function deleteUserAction(
  _: UserManagementFormState,
  formData: FormData,
): Promise<UserManagementFormState> {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "UsersPage",
  });
  const userId = String(formData.get("userId") || "").trim();

  if (!userId) {
    return {
      ...initialUserManagementFormState,
      message: "User ID is required.",
    };
  }

  if (userId === adminUser.id) {
    return {
      ...initialUserManagementFormState,
      message: "You cannot delete your own account.",
    };
  }

  const managedUser = await prisma.adminUser.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          createdPosts: true,
          updatedPosts: true,
          uploadedMedia: true,
        },
      },
    },
  });

  if (!managedUser) {
    return {
      ...initialUserManagementFormState,
      message: "That user no longer exists.",
    };
  }

  if (managedUser.role === AdminUserRole.ADMIN) {
    const adminCount = await getAdminCount();
    if (adminCount <= 1) {
      return {
        ...initialUserManagementFormState,
        message: "You cannot delete the last remaining Admin.",
      };
    }
  }

  const hasOwnedHistory =
    managedUser._count.createdPosts > 0 ||
    managedUser._count.updatedPosts > 0 ||
    managedUser._count.uploadedMedia > 0;

  if (isDeletedArchiveUser(managedUser)) {
    return {
      ...initialUserManagementFormState,
      message: "The Deleted User archive account cannot be removed.",
    };
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  let reassignedToUserId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      if (hasOwnedHistory) {
        const deletedUser = await getOrCreateDeletedUserAccount(tx);
        reassignedToUserId = deletedUser.id;

        if (deletedUser.id === managedUser.id) {
          throw new Error("The Deleted User archive account cannot be removed.");
        }

        await Promise.all([
          tx.socialPost.updateMany({
            where: { createdByAdminUserId: managedUser.id },
            data: { createdByAdminUserId: deletedUser.id },
          }),
          tx.socialPost.updateMany({
            where: { updatedByAdminUserId: managedUser.id },
            data: { updatedByAdminUserId: deletedUser.id },
          }),
          tx.mediaAsset.updateMany({
            where: { createdByAdminUserId: managedUser.id },
            data: { createdByAdminUserId: deletedUser.id },
          }),
        ]);
      }

      await tx.adminUser.delete({
        where: { id: managedUser.id },
      });
    });
  } catch (error) {
    return {
      ...initialUserManagementFormState,
      message:
        error instanceof Error
          ? error.message
          : "This user could not be deleted safely.",
    };
  }

  if (reassignedToUserId) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.USER_HISTORY_REASSIGNED,
      targetType: "AdminUser",
      targetId: managedUser.id,
      ipAddress,
      userAgent,
      metadata: {
        reassignedToAdminUserId: reassignedToUserId,
        createdPosts: managedUser._count.createdPosts,
        updatedPosts: managedUser._count.updatedPosts,
        uploadedMedia: managedUser._count.uploadedMedia,
      },
    });
  }

  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.USER_DELETED,
    targetType: "AdminUser",
    targetId: managedUser.id,
    ipAddress,
    userAgent,
    metadata: {
      username: managedUser.username,
      email: managedUser.email,
      role: managedUser.role,
      reassignedHistoryToAdminUserId: reassignedToUserId,
    },
  });

  revalidatePath("/dashboard/settings/users");
  return {
    success: true,
    message: reassignedToUserId
      ? "User deleted successfully. Post and media history were reassigned to Deleted User."
      : "User deleted successfully.",
  };
}
