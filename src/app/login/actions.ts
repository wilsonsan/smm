"use server";

import { redirect } from "next/navigation";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import {
  consumeRecoveryCodeForAdminUser,
  decryptMfaSecret,
  MFA_RULES,
  verifyTotpCode,
} from "@/lib/auth/mfa";
import { isFailedAuthRateLimitedByIp } from "@/lib/auth/rate-limit";
import {
  authenticateAdmin,
  clearCurrentPendingMfaSession,
  createPendingMfaSessionForAdminUser,
  deletePendingMfaSessionById,
  getCurrentPendingMfaSession,
  incrementPendingMfaSessionAttempts,
  loginAdminUser,
} from "@/lib/auth/session";
import { getRequestMetadata } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  initialFormState,
  loginSchema,
  mfaChallengeSchema,
  type FormState,
} from "@/lib/validation";

export type LoginMfaFormState = FormState;
const initialLoginMfaFormState: LoginMfaFormState = initialFormState;

function buildPendingMfaExpiry() {
  return new Date(Date.now() + MFA_RULES.pendingSessionMinutes * 60 * 1000);
}

async function createFailedLoginAudit(input: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string;
}) {
  await createAuditLog({
    action: AUDIT_ACTIONS.LOGIN_FAILED,
    targetType: "AdminUser",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: {
      email: input.email,
      reason: input.reason,
    },
  }).catch(() => undefined);
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Enter your email and password.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  const email = parsed.data.email.trim().toLowerCase();
  const rateLimited = await isFailedAuthRateLimitedByIp({
    actions: [AUDIT_ACTIONS.LOGIN_FAILED],
    ipAddress,
    windowMinutes: MFA_RULES.loginRateLimitWindowMinutes,
    maxAttempts: MFA_RULES.loginRateLimitAttempts,
  });

  if (rateLimited) {
    return {
      ...initialFormState,
      message: "Too many sign-in attempts. Wait a few minutes and try again.",
    };
  }

  const adminUser = await authenticateAdmin(email, parsed.data.password);
  if (!adminUser) {
    await createFailedLoginAudit({
      email,
      ipAddress,
      userAgent,
      reason: "invalid-credentials",
    });

    return {
      ...initialFormState,
      message: "Invalid email or password.",
    };
  }

  if (adminUser.mfaEnabled) {
    await clearCurrentPendingMfaSession();
    await createPendingMfaSessionForAdminUser(adminUser.id, buildPendingMfaExpiry());
    redirect("/login/mfa");
  }

  await loginAdminUser(adminUser);
  redirect("/dashboard");
}

export async function verifyMfaLoginAction(
  _: LoginMfaFormState,
  formData: FormData,
): Promise<LoginMfaFormState> {
  const parsed = mfaChallengeSchema.safeParse({
    verificationCode: formData.get("verificationCode"),
  });

  if (!parsed.success) {
    return {
      ...initialLoginMfaFormState,
      message: "Enter your authenticator code or a recovery code.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const pendingSession = await getCurrentPendingMfaSession();
  if (!pendingSession) {
    return {
      ...initialLoginMfaFormState,
      message: "Your sign-in session expired. Sign in again to continue.",
    };
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  if (pendingSession.attempts >= MFA_RULES.mfaRateLimitAttempts) {
    await clearCurrentPendingMfaSession();
    await createAuditLog({
      actorAdminUserId: pendingSession.adminUserId,
      action: AUDIT_ACTIONS.MFA_LOGIN_FAILED,
      targetType: "PendingMfaSession",
      targetId: pendingSession.id,
      ipAddress,
      userAgent,
      metadata: {
        reason: "attempt-limit-reached",
      },
    }).catch(() => undefined);

    return {
      ...initialLoginMfaFormState,
      message: "Too many verification attempts. Sign in again to continue.",
    };
  }

  const adminUser = pendingSession.adminUser;
  const rawVerificationCode = parsed.data.verificationCode.trim();
  let verifiedWith: "totp" | "recovery" | null = null;

  if (!adminUser.mfaEnabled || !adminUser.mfaSecretEncrypted) {
    await deletePendingMfaSessionById(pendingSession.id);
    return {
      ...initialLoginMfaFormState,
      message: "Multi-factor authentication is not available for this account. Sign in again.",
    };
  }

  try {
    const secret = await decryptMfaSecret(adminUser.mfaSecretEncrypted);
    if (await verifyTotpCode({ secret, code: rawVerificationCode })) {
      verifiedWith = "totp";
    }
  } catch {
    verifiedWith = null;
  }

  if (!verifiedWith) {
    const usedRecoveryCode = await consumeRecoveryCodeForAdminUser({
      adminUserId: adminUser.id,
      recoveryCode: rawVerificationCode,
    });

    if (usedRecoveryCode) {
      verifiedWith = "recovery";
      await createAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.MFA_RECOVERY_CODE_USED,
        targetType: "MfaRecoveryCode",
        targetId: usedRecoveryCode.id,
        ipAddress,
        userAgent,
      }).catch(() => undefined);
    }
  }

  if (!verifiedWith) {
    await incrementPendingMfaSessionAttempts(pendingSession.id);
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.MFA_LOGIN_FAILED,
      targetType: "PendingMfaSession",
      targetId: pendingSession.id,
      ipAddress,
      userAgent,
      metadata: {
        reason: "invalid-code",
        attempts: pendingSession.attempts + 1,
      },
    }).catch(() => undefined);

    return {
      ...initialLoginMfaFormState,
      message: "Invalid authentication code.",
      fieldErrors: {
        verificationCode: ["Invalid authentication code."],
      },
    };
  }

  await deletePendingMfaSessionById(pendingSession.id);
  await prisma.adminUser.update({
    where: {
      id: adminUser.id,
    },
    data: {
      mfaLastUsedAt: new Date(),
    },
  });
  await loginAdminUser(adminUser);
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.MFA_LOGIN_SUCCESS,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
    metadata: {
      method: verifiedWith,
    },
  }).catch(() => undefined);

  redirect("/dashboard");
}
