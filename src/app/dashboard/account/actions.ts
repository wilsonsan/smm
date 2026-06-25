"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import {
  consumeRecoveryCodeForAdminUser,
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodesWithHashes,
  verifyTotpCode,
} from "@/lib/auth/mfa";
import { requireAuthenticatedUser, rotateCurrentAdminSession } from "@/lib/auth/session";
import { getRequestMetadata } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  accountProfileSchema,
  disableMfaSchema,
  emailChangeSchema,
  initialFormState,
  passwordChangeSchema,
  regenerateMfaRecoveryCodesSchema,
  verifyMfaCodeSchema,
  type FormState,
} from "@/lib/validation";

export type AccountMfaFormState = FormState & {
  recoveryCodes?: string[];
};

export const initialAccountMfaFormState: AccountMfaFormState = {
  ...initialFormState,
  recoveryCodes: [],
};

async function verifyCurrentPassword(input: {
  adminUserId: string;
  currentPassword: string;
}) {
  const existingUser = await prisma.adminUser.findUnique({
    where: {
      id: input.adminUserId,
    },
    select: {
      passwordHash: true,
    },
  });

  if (!existingUser) {
    return {
      success: false,
      message: "Your account could not be found.",
    } as const;
  }

  const currentPasswordMatches = await bcrypt.compare(input.currentPassword, existingUser.passwordHash);
  if (!currentPasswordMatches) {
    return {
      success: false,
      message: "Current password is incorrect.",
    } as const;
  }

  return {
    success: true,
  } as const;
}

async function verifyTotpOrRecoveryCode(input: {
  adminUserId: string;
  secretEncrypted: string;
  verificationCode: string;
}) {
  try {
    const secret = await decryptMfaSecret(input.secretEncrypted);
    if (await verifyTotpCode({ secret, code: input.verificationCode })) {
      return {
        verified: true,
        method: "totp" as const,
        recoveryCodeId: null,
      };
    }
  } catch {}

  const usedRecoveryCode = await consumeRecoveryCodeForAdminUser({
    adminUserId: input.adminUserId,
    recoveryCode: input.verificationCode,
  });

  if (!usedRecoveryCode) {
    return {
      verified: false,
      method: null,
      recoveryCodeId: null,
    } as const;
  }

  return {
    verified: true,
    method: "recovery" as const,
    recoveryCodeId: usedRecoveryCode.id,
  };
}

function revalidateAccountViews() {
  revalidatePath("/dashboard/account");
  revalidatePath("/account/settings");
  revalidatePath("/dashboard");
}

export async function updateAccountProfileAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  const parsed = accountProfileSchema.safeParse({
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted account fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const username = parsed.data.username.trim().toLowerCase();
  const usernameConflict = await prisma.adminUser.findFirst({
    where: {
      username,
      NOT: {
        id: adminUser.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (usernameConflict) {
    return {
      ...initialFormState,
      message: "Choose a different username.",
      fieldErrors: {
        username: ["That username is already in use."],
      },
    };
  }

  const existingUser = await prisma.adminUser.findUnique({
    where: {
      id: adminUser.id,
    },
    select: {
      username: true,
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

  revalidateAccountViews();
  return {
    success: true,
    message: "Profile updated.",
  };
}

export async function changeAccountEmailAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  const parsed = emailChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newEmail: formData.get("newEmail"),
    confirmNewEmail: formData.get("confirmNewEmail"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted email fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const currentPasswordResult = await verifyCurrentPassword({
    adminUserId: adminUser.id,
    currentPassword: parsed.data.currentPassword,
  });
  if (!currentPasswordResult.success) {
    return {
      ...initialFormState,
      message: currentPasswordResult.message,
      fieldErrors: {
        currentPassword: [currentPasswordResult.message],
      },
    };
  }

  const newEmail = parsed.data.newEmail.trim().toLowerCase();
  if (newEmail === adminUser.email.toLowerCase()) {
    return {
      ...initialFormState,
      message: "Enter a different email address to continue.",
      fieldErrors: {
        newEmail: ["Enter a different email address to continue."],
      },
    };
  }

  const emailConflict = await prisma.adminUser.findFirst({
    where: {
      email: newEmail,
      NOT: {
        id: adminUser.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (emailConflict) {
    return {
      ...initialFormState,
      message: "That email address is already in use.",
      fieldErrors: {
        newEmail: ["That email address is already in use."],
      },
    };
  }

  await prisma.adminUser.update({
    where: {
      id: adminUser.id,
    },
    data: {
      email: newEmail,
    },
  });

  await rotateCurrentAdminSession(adminUser.id);
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.ACCOUNT_EMAIL_UPDATED,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
    metadata: {
      previousEmail: adminUser.email,
      nextEmail: newEmail,
    },
  });

  revalidateAccountViews();
  return {
    success: true,
    message: "Email address updated.",
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

  const currentPasswordResult = await verifyCurrentPassword({
    adminUserId: adminUser.id,
    currentPassword: parsed.data.currentPassword,
  });
  if (!currentPasswordResult.success) {
    return {
      ...initialFormState,
      message: currentPasswordResult.message,
      fieldErrors: {
        currentPassword: [currentPasswordResult.message],
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

  await rotateCurrentAdminSession(adminUser.id);
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.ACCOUNT_PASSWORD_CHANGED,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
  });

  revalidateAccountViews();
  return {
    success: true,
    message: "Password updated.",
  };
}

export async function startMfaSetupAction(_: AccountMfaFormState, _formData: FormData): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  if (adminUser.mfaEnabled) {
    return {
      ...initialFormState,
      message: "MFA is already enabled for this account.",
    };
  }

  let encryptedSecret: string;
  try {
    encryptedSecret = await encryptMfaSecret(generateMfaSecret());
  } catch (error) {
    return {
      ...initialFormState,
      message: error instanceof Error ? error.message : "MFA could not be started right now.",
    };
  }

  await prisma.adminUser.update({
    where: {
      id: adminUser.id,
    },
    data: {
      mfaEnabled: false,
      mfaSecretEncrypted: encryptedSecret,
      mfaVerifiedAt: null,
      mfaLastUsedAt: null,
    },
  });

  await prisma.mfaRecoveryCode.deleteMany({
    where: {
      adminUserId: adminUser.id,
    },
  });

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.MFA_SETUP_STARTED,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
  });

  revalidateAccountViews();
  return {
    success: true,
    message: "Scan the QR code, then enter the 6-digit code from your authenticator app.",
  };
}

export async function verifyMfaSetupAction(
  _: AccountMfaFormState,
  formData: FormData,
): Promise<AccountMfaFormState> {
  const adminUser = await requireAuthenticatedUser();
  const parsed = verifyMfaCodeSchema.safeParse({
    verificationCode: formData.get("verificationCode"),
  });

  if (!parsed.success) {
    return {
      ...initialAccountMfaFormState,
      message: "Enter a valid 6-digit code.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const currentUser = await prisma.adminUser.findUnique({
    where: {
      id: adminUser.id,
    },
    select: {
      mfaSecretEncrypted: true,
      mfaEnabled: true,
    },
  });

  if (!currentUser?.mfaSecretEncrypted) {
    return {
      ...initialAccountMfaFormState,
      message: "Start MFA setup before verifying a code.",
    };
  }

  let secret: string;
  try {
    secret = await decryptMfaSecret(currentUser.mfaSecretEncrypted);
  } catch {
    return {
      ...initialAccountMfaFormState,
      message: "The saved MFA setup could not be read. Start setup again.",
    };
  }

  if (!(await verifyTotpCode({ secret, code: parsed.data.verificationCode }))) {
    return {
      ...initialAccountMfaFormState,
      message: "Invalid authentication code.",
      fieldErrors: {
        verificationCode: ["Invalid authentication code."],
      },
    };
  }

  const { recoveryCodes, codeHashes } = await generateRecoveryCodesWithHashes();
  const now = new Date();
  await prisma.$transaction([
    prisma.adminUser.update({
      where: {
        id: adminUser.id,
      },
      data: {
        mfaEnabled: true,
        mfaVerifiedAt: now,
        mfaLastUsedAt: now,
      },
    }),
    prisma.mfaRecoveryCode.deleteMany({
      where: {
        adminUserId: adminUser.id,
      },
    }),
    prisma.mfaRecoveryCode.createMany({
      data: codeHashes.map((codeHash) => ({
        adminUserId: adminUser.id,
        codeHash,
      })),
    }),
  ]);

  await rotateCurrentAdminSession(adminUser.id);
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.MFA_ENABLED,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
  });
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.MFA_RECOVERY_CODES_GENERATED,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
    metadata: {
      count: recoveryCodes.length,
      reason: "initial-setup",
    },
  });

  revalidateAccountViews();
  return {
    success: true,
    message: "MFA enabled. Save these recovery codes in a secure place. They will only be shown once.",
    recoveryCodes,
  };
}

export async function regenerateMfaRecoveryCodesAction(
  _: AccountMfaFormState,
  formData: FormData,
): Promise<AccountMfaFormState> {
  const adminUser = await requireAuthenticatedUser();
  const parsed = regenerateMfaRecoveryCodesSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    verificationCode: formData.get("verificationCode"),
  });

  if (!parsed.success) {
    return {
      ...initialAccountMfaFormState,
      message: "Fix the highlighted recovery code fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const currentPasswordResult = await verifyCurrentPassword({
    adminUserId: adminUser.id,
    currentPassword: parsed.data.currentPassword,
  });
  if (!currentPasswordResult.success) {
    return {
      ...initialAccountMfaFormState,
      message: currentPasswordResult.message,
      fieldErrors: {
        currentPassword: [currentPasswordResult.message],
      },
    };
  }

  const currentUser = await prisma.adminUser.findUnique({
    where: {
      id: adminUser.id,
    },
    select: {
      mfaEnabled: true,
      mfaSecretEncrypted: true,
    },
  });

  if (!currentUser?.mfaEnabled || !currentUser.mfaSecretEncrypted) {
    return {
      ...initialAccountMfaFormState,
      message: "Enable MFA before regenerating recovery codes.",
    };
  }

  const verificationResult = await verifyTotpOrRecoveryCode({
    adminUserId: adminUser.id,
    secretEncrypted: currentUser.mfaSecretEncrypted,
    verificationCode: parsed.data.verificationCode,
  });

  if (!verificationResult.verified) {
    return {
      ...initialAccountMfaFormState,
      message: "Invalid authentication code.",
      fieldErrors: {
        verificationCode: ["Invalid authentication code."],
      },
    };
  }

  const { recoveryCodes, codeHashes } = await generateRecoveryCodesWithHashes();
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({
      where: {
        adminUserId: adminUser.id,
      },
    }),
    prisma.mfaRecoveryCode.createMany({
      data: codeHashes.map((codeHash) => ({
        adminUserId: adminUser.id,
        codeHash,
      })),
    }),
  ]);

  await rotateCurrentAdminSession(adminUser.id);
  const { ipAddress, userAgent } = await getRequestMetadata();
  if (verificationResult.recoveryCodeId) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.MFA_RECOVERY_CODE_USED,
      targetType: "MfaRecoveryCode",
      targetId: verificationResult.recoveryCodeId,
      ipAddress,
      userAgent,
      metadata: {
        reason: "recovery-code-regeneration",
      },
    });
  }

  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.MFA_RECOVERY_CODES_GENERATED,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
    metadata: {
      count: recoveryCodes.length,
      reason: "manual-regeneration",
      verificationMethod: verificationResult.method,
    },
  });

  revalidateAccountViews();
  return {
    success: true,
    message: "Recovery codes regenerated. Save the new set now because the old ones no longer work.",
    recoveryCodes,
  };
}

export async function disableMfaAction(
  _: AccountMfaFormState,
  formData: FormData,
): Promise<AccountMfaFormState> {
  const adminUser = await requireAuthenticatedUser();
  const parsed = disableMfaSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    verificationCode: formData.get("verificationCode"),
  });

  if (!parsed.success) {
    return {
      ...initialAccountMfaFormState,
      message: "Fix the highlighted MFA fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const currentPasswordResult = await verifyCurrentPassword({
    adminUserId: adminUser.id,
    currentPassword: parsed.data.currentPassword,
  });
  if (!currentPasswordResult.success) {
    return {
      ...initialAccountMfaFormState,
      message: currentPasswordResult.message,
      fieldErrors: {
        currentPassword: [currentPasswordResult.message],
      },
    };
  }

  const currentUser = await prisma.adminUser.findUnique({
    where: {
      id: adminUser.id,
    },
    select: {
      mfaEnabled: true,
      mfaSecretEncrypted: true,
    },
  });

  if (!currentUser?.mfaEnabled || !currentUser.mfaSecretEncrypted) {
    return {
      ...initialAccountMfaFormState,
      message: "MFA is not enabled for this account.",
    };
  }

  const verificationResult = await verifyTotpOrRecoveryCode({
    adminUserId: adminUser.id,
    secretEncrypted: currentUser.mfaSecretEncrypted,
    verificationCode: parsed.data.verificationCode,
  });

  if (!verificationResult.verified) {
    return {
      ...initialAccountMfaFormState,
      message: "Invalid authentication code.",
      fieldErrors: {
        verificationCode: ["Invalid authentication code."],
      },
    };
  }

  await prisma.$transaction([
    prisma.adminUser.update({
      where: {
        id: adminUser.id,
      },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaVerifiedAt: null,
        mfaLastUsedAt: null,
      },
    }),
    prisma.mfaRecoveryCode.deleteMany({
      where: {
        adminUserId: adminUser.id,
      },
    }),
  ]);

  await rotateCurrentAdminSession(adminUser.id);
  const { ipAddress, userAgent } = await getRequestMetadata();
  if (verificationResult.recoveryCodeId) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.MFA_RECOVERY_CODE_USED,
      targetType: "MfaRecoveryCode",
      targetId: verificationResult.recoveryCodeId,
      ipAddress,
      userAgent,
      metadata: {
        reason: "mfa-disabled",
      },
    });
  }

  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.MFA_DISABLED,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
    metadata: {
      verificationMethod: verificationResult.method,
    },
  });

  revalidateAccountViews();
  return {
    success: true,
    message: "MFA disabled for this account.",
  };
}
