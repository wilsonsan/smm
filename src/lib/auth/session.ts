import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminUser } from "@prisma/client";
import { env, isProduction } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getRequestMetadata } from "@/lib/http";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";

export const SESSION_COOKIE_NAME = "smm_admin_session";

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
    secure: isProduction,
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
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

export async function requireAdminUser() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/login");
  }

  return session.adminUser;
}

export async function requireAdminSessionFromRequest(
  request: Request,
  options?: {
    touch?: boolean;
  },
) {
  const token = getSessionTokenFromCookieHeader(request.headers.get("cookie"));
  const session = await getAdminSessionByToken(token, options);

  if (!session) {
    throw new Response("Unauthorized.", { status: 401 });
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

export async function authenticateAdmin(email: string, password: string): Promise<AdminUser | null> {
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!adminUser) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, adminUser.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  return adminUser;
}

export async function loginAdminUser(adminUser: AdminUser) {
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
