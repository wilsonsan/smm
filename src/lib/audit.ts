import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type CreateAuditLogInput = {
  actorAdminUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function createAuditLog(input: CreateAuditLogInput) {
  await prisma.auditLog.create({
    data: {
      actorAdminUserId: input.actorAdminUserId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata,
    },
  });
}

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  POST_CREATED: "POST_CREATED",
  POST_UPDATED: "POST_UPDATED",
  POST_SCHEDULED: "POST_SCHEDULED",
  MEDIA_UPLOADED: "MEDIA_UPLOADED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
} as const;

