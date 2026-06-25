import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminUser, AdminUserRole, Prisma } from "@prisma/client";
import { env, isSecureAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getRequestMetadata } from "@/lib/http";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { isDeletedArchiveUser } from "@/lib/managed-users";

export const SESSION_COOKIE_NAME = "smm_admin_session";
export const PENDING_MFA_COOKIE_NAME = "smm_pending_mfa_session";

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildSessionExpiry() {
  return new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureAppUrl,
    expires: expiresAt,
    path: "/",
  });
}

async function setPendingMfaCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_MFA_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureAppUrl,
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureAppUrl,
    expires: new Date(0),
    path: "/",
  });
}

export async function clearPendingMfaCookie() {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_MFA_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureAppUrl,
    expires: new Date(0),
    path: "/",
  });
}

function getSessionTokenFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  return (
    cookieHeader
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.slice(SESSION_COOKIE_NAME.length + 1) ?? null
  );
}

export async function getAdminSessionByToken(
  token: string | null | undefined,
  options?: {
    touch?: boolean;
  },
) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });

  if (!session) {
    return null;
  }

  if (isDeletedArchiveUser(session.adminUser)) {
    await prisma.adminSession.delete({
      where: { id: session.id },
    }).catch(() => undefined);
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.adminSession.delete({
      where: { id: session.id },
    });
    return null;
  }

  if (options?.touch !== false) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastAccessedAt: new Date() },
    });
  }

  return session;
}

export async function getCurrentAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return getAdminSessionByToken(token);
}

export async function getCurrentAdminUser() {
  const session = await getCurrentAdminSession();
  return session?.adminUser ?? null;
}

export async function getPendingMfaSessionByToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const pendingSession = await prisma.pendingMfaSession.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });

  if (!pendingSession) {
    return null;
  }

  if (isDeletedArchiveUser(pendingSession.adminUser)) {
    await prisma.pendingMfaSession.delete({
      where: { id: pendingSession.id },
    }).catch(() => undefined);
    return null;
  }

  if (pendingSession.expiresAt <= new Date()) {
    await prisma.pendingMfaSession.delete({
      where: { id: pendingSession.id },
    }).catch(() => undefined);
    return null;
  }

  return pendingSession;
}

export async function getCurrentPendingMfaSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_MFA_COOKIE_NAME)?.value;
  return getPendingMfaSessionByToken(token);
}

export function isAdminUserRole(role: AdminUserRole) {
  return role === AdminUserRole.ADMIN;
}

export function canAccessOwnedResource(adminUser: Pick<AdminUser, "id" | "role">, ownerAdminUserId: string | null | undefined) {
  return isAdminUserRole(adminUser.role) || ownerAdminUserId === adminUser.id;
}

async function logAdminAccessDenied(input: {
  actorAdminUserId: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: input.actorAdminUserId,
    action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED,
    targetType: input.targetType ?? "AdminOnlyResource",
    targetId: input.targetId ?? null,
    ipAddress,
    userAgent,
    metadata: input.metadata,
  }).catch(() => undefined);
}

export async function requireAuthenticatedUser() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/login");
  }

  return session.adminUser;
}

export async function requireAdminUser(input?: {
  redirectTo?: string;
  targetType?: string;
  targetId?: string | null;
}) {
  const adminUser = await requireAuthenticatedUser();

  if (!isAdminUserRole(adminUser.role)) {
    await logAdminAccessDenied({
      actorAdminUserId: adminUser.id,
      targetType: input?.targetType,
      targetId: input?.targetId,
      metadata: {
        requiredRole: AdminUserRole.ADMIN,
        actualRole: adminUser.role,
      },
    });
    redirect(input?.redirectTo || "/dashboard");
  }

  return adminUser;
}

export async function requireCreatorOrAdminUser() {
  return requireAuthenticatedUser();
}

export async function requireAdminSessionFromRequest(
  request: Request,
  options?: {
    touch?: boolean;
    requireAdmin?: boolean;
  },
) {
  const token = getSessionTokenFromCookieHeader(request.headers.get("cookie"));
  const session = await getAdminSessionByToken(token, options);

  if (!session) {
    throw new Response("Unauthorized.", { status: 401 });
  }

  if (options?.requireAdmin && !isAdminUserRole(session.adminUser.role)) {
    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED,
      targetType: "AdminOnlyRoute",
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
      metadata: {
        requiredRole: AdminUserRole.ADMIN,
        actualRole: session.adminUser.role,
        method: request.method,
        url: request.url,
      },
    }).catch(() => undefined);
    throw new Response("Forbidden.", { status: 403 });
  }

  return session;
}

export async function createSessionForAdminUser(adminUserId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = buildSessionExpiry();
  const { ipAddress, userAgent } = await getRequestMetadata();

  await prisma.adminSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      adminUserId,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  await setSessionCookie(token, expiresAt);
}

export async function rotateCurrentAdminSession(adminUserId: string) {
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (currentToken) {
    const currentSession = await getAdminSessionByToken(currentToken, { touch: false });
    if (currentSession) {
      await prisma.adminSession.delete({
        where: { id: currentSession.id },
      }).catch(() => undefined);
    }
  }

  await createSessionForAdminUser(adminUserId);
}

export async function createPendingMfaSessionForAdminUser(adminUserId: string, expiresAt: Date) {
  const token = randomBytes(32).toString("hex");
  const { ipAddress, userAgent } = await getRequestMetadata();
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(PENDING_MFA_COOKIE_NAME)?.value;
  const existingSession = await getPendingMfaSessionByToken(existingToken);

  if (existingSession) {
    await deletePendingMfaSessionById(existingSession.id);
  }

  await prisma.pendingMfaSession.deleteMany({
    where: {
      adminUserId,
    },
  });

  await prisma.pendingMfaSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      adminUserId,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  await setPendingMfaCookie(token, expiresAt);
}

export async function deletePendingMfaSessionById(id: string) {
  await prisma.pendingMfaSession.delete({
    where: { id },
  }).catch(() => undefined);
}

export async function incrementPendingMfaSessionAttempts(id: string) {
  return prisma.pendingMfaSession.update({
    where: { id },
    data: {
      attempts: {
        increment: 1,
      },
    },
  });
}

export async function clearCurrentPendingMfaSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_MFA_COOKIE_NAME)?.value;
  const pendingSession = await getPendingMfaSessionByToken(token);
  if (pendingSession) {
    await deletePendingMfaSessionById(pendingSession.id);
  }

  await clearPendingMfaCookie();
}

export async function authenticateAdmin(email: string, password: string): Promise<AdminUser | null> {
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!adminUser) {
    return null;
  }

  if (isDeletedArchiveUser(adminUser)) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, adminUser.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  return adminUser;
}

export async function loginAdminUser(adminUser: AdminUser) {
  if (isDeletedArchiveUser(adminUser)) {
    return;
  }

  await clearCurrentPendingMfaSession();

  await prisma.adminUser.update({
    where: { id: adminUser.id },
    data: { lastLoginAt: new Date() },
  });

  await createSessionForAdminUser(adminUser.id);

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.LOGIN,
    targetType: "AdminUser",
    targetId: adminUser.id,
    ipAddress,
    userAgent,
  });
}

export async function logoutCurrentAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getAdminSessionByToken(token);

  if (session) {
    const { ipAddress, userAgent } = await getRequestMetadata();
    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: "AdminSession",
      targetId: session.id,
      ipAddress,
      userAgent,
    });

    await prisma.adminSession.delete({
      where: { id: session.id },
    });
  }

  await clearSessionCookie();
}
