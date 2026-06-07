import {
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
  Prisma,
  SocialPlatform,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";

export const FACEBOOK_SETTINGS_ACTION_URL = "/dashboard/settings/channels/facebook";
export const GOOGLE_SETTINGS_ACTION_URL = "/dashboard/settings/channels/google";

const TOKEN_NOTIFICATION_TYPES = [
  NotificationType.TOKEN_EXPIRED,
  NotificationType.TOKEN_INVALID,
  NotificationType.MISSING_SCOPE,
] as const;

type UpsertNotificationInput = {
  actorAdminUserId?: string | null;
  type: NotificationType;
  provider?: SocialPlatform | null;
  severity: NotificationSeverity;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Prisma.InputJsonValue;
};

type ProviderNotificationInput = {
  actorAdminUserId?: string | null;
  provider: SocialPlatform;
  status: "expired" | "invalid" | "missing_scopes";
  detail?: string | null;
};

function buildNotificationAuditMetadata(input: {
  notificationId: string;
  title: string;
  provider?: SocialPlatform | null;
  type: NotificationType;
  status: NotificationStatus;
}) {
  return {
    notificationId: input.notificationId,
    title: input.title,
    provider: input.provider ?? null,
    type: input.type,
    status: input.status,
  } satisfies Prisma.InputJsonObject;
}

async function writeNotificationAuditLog(input: {
  actorAdminUserId?: string | null;
  action: string;
  notificationId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await createAuditLog({
    actorAdminUserId: input.actorAdminUserId ?? null,
    action: input.action,
    targetType: "Notification",
    targetId: input.notificationId,
    metadata: input.metadata,
  });
}

export async function getNotificationCenterSnapshot() {
  const [unreadCount, unreadNotifications] = await Promise.all([
    prisma.notification.count({
      where: {
        status: NotificationStatus.UNREAD,
      },
    }),
    prisma.notification.findMany({
      where: {
        status: NotificationStatus.UNREAD,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
    }),
  ]);

  return {
    unreadCount,
    unreadNotifications,
  };
}

export async function createOrUpdateNotification(input: UpsertNotificationInput) {
  const existing = await prisma.notification.findFirst({
    where: {
      provider: input.provider ?? null,
      type: input.type,
      status: {
        in: [NotificationStatus.UNREAD, NotificationStatus.READ],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existing) {
    const updated = await prisma.notification.update({
      where: {
        id: existing.id,
      },
      data: {
        severity: input.severity,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });

    return updated;
  }

  const created = await prisma.notification.create({
    data: {
      type: input.type,
      provider: input.provider ?? null,
      severity: input.severity,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl ?? null,
      status: NotificationStatus.UNREAD,
      metadata: input.metadata ?? undefined,
    },
  });

  await writeNotificationAuditLog({
    actorAdminUserId: input.actorAdminUserId,
    action: AUDIT_ACTIONS.NOTIFICATION_CREATED,
    notificationId: created.id,
    metadata: buildNotificationAuditMetadata({
      notificationId: created.id,
      title: created.title,
      provider: created.provider,
      type: created.type,
      status: created.status,
    }),
  });

  return created;
}

export async function createOrUpdateFacebookTokenNotification(input: ProviderNotificationInput) {
  return createOrUpdateProviderTokenNotification({
    ...input,
    actionUrl: FACEBOOK_SETTINGS_ACTION_URL,
    providerLabel: "Facebook",
  });
}

export async function createOrUpdateProviderTokenNotification(
  input: ProviderNotificationInput & {
    actionUrl: string;
    providerLabel: string;
  },
) {
  const type =
    input.status === "expired"
      ? NotificationType.TOKEN_EXPIRED
      : input.status === "missing_scopes"
        ? NotificationType.MISSING_SCOPE
        : NotificationType.TOKEN_INVALID;
  const title =
    input.status === "expired"
      ? `${input.providerLabel} token expired`
      : input.status === "missing_scopes"
        ? `${input.providerLabel} permissions need attention`
        : `${input.providerLabel} needs to be reconnected`;
  const message =
    input.status === "expired"
      ? `Reconnect ${input.providerLabel} to resume scheduled posting.`
      : input.status === "missing_scopes"
        ? `Reconnect ${input.providerLabel} and approve the required permissions to keep posting.`
        : `Reconnect ${input.providerLabel} to resume scheduled posting.`;

  const existing = await prisma.notification.findFirst({
    where: {
      provider: input.provider,
      type: {
        in: [...TOKEN_NOTIFICATION_TYPES],
      },
      status: {
        in: [NotificationStatus.UNREAD, NotificationStatus.READ],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existing) {
    const nextMessage = input.detail ? `${message} ${input.detail}` : message;
    const shouldRealert = existing.type !== type || existing.title !== title || existing.message !== nextMessage;

    return prisma.notification.update({
      where: {
        id: existing.id,
      },
      data: {
        type,
        severity: NotificationSeverity.ERROR,
        title,
        message: nextMessage,
        actionUrl: input.actionUrl,
        status: shouldRealert ? NotificationStatus.UNREAD : existing.status,
        readAt: shouldRealert ? null : existing.readAt,
        readByAdminUserId: shouldRealert ? null : existing.readByAdminUserId,
        metadata: input.detail
          ? {
              detail: input.detail,
            }
          : Prisma.JsonNull,
      },
    });
  }

  return createOrUpdateNotification({
    actorAdminUserId: input.actorAdminUserId,
    type,
    provider: input.provider,
    severity: NotificationSeverity.ERROR,
    title,
    message: input.detail ? `${message} ${input.detail}` : message,
    actionUrl: input.actionUrl,
    metadata: input.detail
      ? {
          detail: input.detail,
        }
      : undefined,
  });
}

export async function createOrUpdateGoogleTokenNotification(input: ProviderNotificationInput) {
  return createOrUpdateProviderTokenNotification({
    ...input,
    actionUrl: GOOGLE_SETTINGS_ACTION_URL,
    providerLabel: "Google Business",
  });
}

export async function createOrUpdateGooglePublishFailedNotification(input: {
  actorAdminUserId?: string | null;
  message: string;
  detail?: string | null;
}) {
  return createOrUpdateNotification({
    actorAdminUserId: input.actorAdminUserId,
    type: NotificationType.PUBLISH_FAILED,
    provider: SocialPlatform.GOOGLE_BUSINESS,
    severity: NotificationSeverity.ERROR,
    title: "Google Business publish failed",
    message: input.detail ? `${input.message} ${input.detail}` : input.message,
    actionUrl: GOOGLE_SETTINGS_ACTION_URL,
    metadata: input.detail ? { detail: input.detail } : undefined,
  });
}

export async function createOrUpdateGoogleDisconnectedNotification(input?: {
  actorAdminUserId?: string | null;
  detail?: string | null;
}) {
  return createOrUpdateNotification({
    actorAdminUserId: input?.actorAdminUserId,
    type: NotificationType.INFO,
    provider: SocialPlatform.GOOGLE_BUSINESS,
    severity: NotificationSeverity.WARNING,
    title: "Google Business disconnected",
    message: input?.detail
      ? `Reconnect Google Business to resume posting. ${input.detail}`
      : "Reconnect Google Business to resume posting.",
    actionUrl: GOOGLE_SETTINGS_ACTION_URL,
    metadata: input?.detail ? { detail: input.detail } : undefined,
  });
}

export async function dismissProviderNotifications(input: {
  actorAdminUserId?: string | null;
  provider?: SocialPlatform | null;
  types?: NotificationType[];
}) {
  const notifications = await prisma.notification.findMany({
    where: {
      provider: input.provider === undefined ? undefined : input.provider,
      type: input.types ? { in: input.types } : undefined,
      status: {
        in: [NotificationStatus.UNREAD, NotificationStatus.READ],
      },
    },
    select: {
      id: true,
      title: true,
      provider: true,
      type: true,
    },
  });

  if (notifications.length === 0) {
    return 0;
  }

  const now = new Date();
  await prisma.notification.updateMany({
    where: {
      id: {
        in: notifications.map((notification) => notification.id),
      },
    },
    data: {
      status: NotificationStatus.DISMISSED,
      dismissedAt: now,
    },
  });

  await Promise.all(
    notifications.map((notification) =>
      writeNotificationAuditLog({
        actorAdminUserId: input.actorAdminUserId,
        action: AUDIT_ACTIONS.NOTIFICATION_DISMISSED,
        notificationId: notification.id,
        metadata: buildNotificationAuditMetadata({
          notificationId: notification.id,
          title: notification.title,
          provider: notification.provider,
          type: notification.type,
          status: NotificationStatus.DISMISSED,
        }),
      }),
    ),
  );

  return notifications.length;
}

export async function markNotificationRead(input: {
  notificationId: string;
  actorAdminUserId: string;
}) {
  const notification = await prisma.notification.findUnique({
    where: {
      id: input.notificationId,
    },
  });

  if (!notification) {
    return null;
  }

  if (notification.status === NotificationStatus.UNREAD) {
    const readAt = new Date();
    const updated = await prisma.notification.update({
      where: {
        id: notification.id,
      },
      data: {
        status: NotificationStatus.READ,
        readAt,
        readByAdminUserId: input.actorAdminUserId,
      },
    });

    await writeNotificationAuditLog({
      actorAdminUserId: input.actorAdminUserId,
      action: AUDIT_ACTIONS.NOTIFICATION_READ,
      notificationId: updated.id,
      metadata: buildNotificationAuditMetadata({
        notificationId: updated.id,
        title: updated.title,
        provider: updated.provider,
        type: updated.type,
        status: updated.status,
      }),
    });

    return updated;
  }

  return notification;
}

export async function createOrUpdateWorkerErrorNotification(input: {
  message: string;
}) {
  return createOrUpdateNotification({
    type: NotificationType.WORKER_ERROR,
    severity: NotificationSeverity.ERROR,
    title: "Worker needs attention",
    message: input.message,
    actionUrl: "/dashboard",
  });
}

export async function dismissWorkerErrorNotifications() {
  return dismissProviderNotifications({
    provider: null,
    types: [NotificationType.WORKER_ERROR],
  });
}
