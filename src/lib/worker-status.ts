import {
  ConnectedAccountStatus,
  PublishAttemptStatus,
  SocialPlatform,
  SocialPostStatus,
} from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_KEYS, getAppSettingValue, upsertAppSetting } from "@/lib/settings";

type WorkerRunSummary = {
  claimedCount: number;
  publishedCount: number;
  failedCount: number;
  skippedCount: number;
  recoveredCount?: number;
};

export const WORKER_PUBLISH_TIMEOUT_MINUTES = 30;
const MONITORED_PLATFORMS = [SocialPlatform.FACEBOOK, SocialPlatform.INSTAGRAM, SocialPlatform.GOOGLE_BUSINESS] as const;

export type WorkerHeartbeatState =
  | "starting"
  | "claiming"
  | "publishing"
  | "idle"
  | "stopping"
  | "error";

type WorkerHealthStatus = "healthy" | "warning" | "critical";

type WorkerPublishAttemptSummary = {
  id: string;
  socialPostId: string;
  startedAt: Date;
  finishedAt: Date | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  socialPost: {
    id: string;
    internalTitle: string;
  };
};

function parseWorkerResult(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as WorkerRunSummary;
  } catch {
    return null;
  }
}

function parseDateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveWorkerHealthWindows() {
  return {
    staleAfterMs: Math.max(env.WORKER_POLL_INTERVAL_MS * 3, 180_000),
    backlogWarningAfterMs: Math.max(env.WORKER_POLL_INTERVAL_MS * 3, 300_000),
  };
}

export async function recordWorkerRunStatus(input: {
  finishedAt: Date;
  result: WorkerRunSummary;
  errorMessage?: string | null;
}) {
  await Promise.all([
    upsertAppSetting(APP_SETTING_KEYS.WORKER_LAST_RUN_AT, input.finishedAt.toISOString()),
    upsertAppSetting(APP_SETTING_KEYS.WORKER_LAST_RESULT, JSON.stringify(input.result)),
    upsertAppSetting(APP_SETTING_KEYS.WORKER_LAST_ERROR, input.errorMessage?.trim() || ""),
  ]);
}

export async function recordWorkerHeartbeat(input: {
  at?: Date;
  state: WorkerHeartbeatState;
}) {
  const occurredAt = input.at ?? new Date();

  await Promise.all([
    upsertAppSetting(APP_SETTING_KEYS.WORKER_LAST_HEARTBEAT_AT, occurredAt.toISOString()),
    upsertAppSetting(APP_SETTING_KEYS.WORKER_LAST_HEARTBEAT_STATE, input.state),
  ]);
}

export async function getWorkerStatusOverview() {
  const now = new Date();
  const [
    lastRunAt,
    lastResultValue,
    lastError,
    lastHeartbeatAt,
    lastHeartbeatState,
    dueScheduledPostsCount,
    publishingPostsCount,
    failedPostsCount,
    nextScheduledPost,
    oldestDuePlatform,
    lastSuccessfulPublish,
    lastFailedPublish,
    stuckPublishingCount,
    connectedPage,
  ] = await Promise.all([
    getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_RUN_AT),
    getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_RESULT),
    getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_ERROR),
    getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_HEARTBEAT_AT),
    getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_HEARTBEAT_STATE),
    prisma.socialPostPlatform.count({
      where: {
        platform: {
          in: [...MONITORED_PLATFORMS],
        },
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: {
          lte: now,
        },
      },
    }),
    prisma.socialPostPlatform.count({
      where: {
        platform: {
          in: [...MONITORED_PLATFORMS],
        },
        status: SocialPostStatus.PUBLISHING,
      },
    }),
    prisma.socialPostPlatform.count({
      where: {
        platform: {
          in: [...MONITORED_PLATFORMS],
        },
        status: SocialPostStatus.FAILED,
      },
    }),
    prisma.socialPost.findFirst({
      where: {
        status: SocialPostStatus.SCHEDULED,
      },
      orderBy: {
        scheduledAt: "asc",
      },
      select: {
        id: true,
        internalTitle: true,
        scheduledAt: true,
      },
    }),
    prisma.socialPostPlatform.findFirst({
      where: {
        platform: {
          in: [...MONITORED_PLATFORMS],
        },
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: {
          lte: now,
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
      select: {
        id: true,
        platform: true,
        scheduledAt: true,
        socialPostId: true,
        socialPost: {
          select: {
            id: true,
            internalTitle: true,
          },
        },
      },
    }),
    prisma.publishAttempt.findFirst({
      where: {
        platform: {
          in: [...MONITORED_PLATFORMS],
        },
        status: PublishAttemptStatus.SUCCEEDED,
      },
      orderBy: {
        finishedAt: "desc",
      },
      select: {
        id: true,
        socialPostId: true,
        startedAt: true,
        finishedAt: true,
        platformPostId: true,
        platformPostUrl: true,
        errorCode: true,
        errorMessage: true,
        socialPost: {
          select: {
            id: true,
            internalTitle: true,
          },
        },
      },
    }),
    prisma.publishAttempt.findFirst({
      where: {
        platform: {
          in: [...MONITORED_PLATFORMS],
        },
        status: PublishAttemptStatus.FAILED,
      },
      orderBy: {
        finishedAt: "desc",
      },
      select: {
        id: true,
        socialPostId: true,
        startedAt: true,
        finishedAt: true,
        platformPostId: true,
        platformPostUrl: true,
        errorCode: true,
        errorMessage: true,
        socialPost: {
          select: {
            id: true,
            internalTitle: true,
          },
        },
      },
    }),
    prisma.socialPostPlatform.count({
      where: {
        platform: {
          in: [...MONITORED_PLATFORMS],
        },
        status: SocialPostStatus.PUBLISHING,
        updatedAt: {
          lt: new Date(now.getTime() - WORKER_PUBLISH_TIMEOUT_MINUTES * 60 * 1000),
        },
      },
    }),
    prisma.connectedAccount.findUnique({
      where: {
        platform: SocialPlatform.FACEBOOK,
      },
      select: {
        pageName: true,
        pageId: true,
        status: true,
        lastTestedAt: true,
      },
    }),
  ]);

  const parsedLastResult = parseWorkerResult(lastResultValue);
  const parsedLastRunAt = parseDateValue(lastRunAt);
  const parsedLastHeartbeatAt = parseDateValue(lastHeartbeatAt);
  const parsedOldestDueScheduledAt =
    oldestDuePlatform?.scheduledAt instanceof Date && !Number.isNaN(oldestDuePlatform.scheduledAt.getTime())
      ? oldestDuePlatform.scheduledAt
      : null;
  const isAutomatic = env.WORKER_MODE === "service";
  const { staleAfterMs, backlogWarningAfterMs } = resolveWorkerHealthWindows();
  const heartbeatAgeMs = parsedLastHeartbeatAt ? now.getTime() - parsedLastHeartbeatAt.getTime() : null;
  const oldestDueAgeMs = parsedOldestDueScheduledAt ? now.getTime() - parsedOldestDueScheduledAt.getTime() : null;
  const isWorkerStale = isAutomatic && (!parsedLastHeartbeatAt || heartbeatAgeMs === null || heartbeatAgeMs > staleAfterMs);
  const isBehindSchedule =
    isAutomatic &&
    dueScheduledPostsCount > 0 &&
    oldestDueAgeMs !== null &&
    oldestDueAgeMs > backlogWarningAfterMs;
  const lastWorkerError = lastError || null;

  let workerHealthStatus: WorkerHealthStatus = "healthy";
  let workerHealthMessage = "Worker heartbeat is current.";

  if (!isAutomatic) {
    workerHealthMessage = "Worker service mode is disabled. Scheduled posts need a manual cron or one-off worker run.";
  } else if (isWorkerStale) {
    workerHealthStatus = "critical";
    workerHealthMessage = parsedLastHeartbeatAt
      ? `Worker heartbeat is stale. The last heartbeat was ${Math.round((heartbeatAgeMs ?? 0) / 1000)} seconds ago.`
      : "Worker heartbeat has never been recorded.";
  } else if (isBehindSchedule) {
    workerHealthStatus = "warning";
    workerHealthMessage = `The worker is running, but scheduled posts are building up. The oldest due platform post is ${Math.round(
      (oldestDueAgeMs ?? 0) / 60_000,
    )} minutes late.`;
  } else if (stuckPublishingCount > 0) {
    workerHealthStatus = "warning";
    workerHealthMessage = `${stuckPublishingCount} publish job${stuckPublishingCount === 1 ? "" : "s"} may be stuck and need recovery.`;
  } else if (lastWorkerError) {
    workerHealthStatus = "warning";
    workerHealthMessage = "The latest worker cycle completed with an error that should be reviewed.";
  }

  return {
    enabled: true,
    mode: isAutomatic ? "Dedicated background service" : "Manual cron command",
    runsAutomatically: isAutomatic,
    lastRunAt: parsedLastRunAt,
    lastRunResult: parsedLastResult,
    lastWorkerError,
    lastHeartbeatAt: parsedLastHeartbeatAt,
    lastHeartbeatState: (lastHeartbeatState || null) as WorkerHeartbeatState | null,
    heartbeatAgeMs,
    staleAfterMs,
    backlogWarningAfterMs,
    workerHealthStatus,
    workerHealthMessage,
    isWorkerStale,
    isBehindSchedule,
    dueScheduledPostsCount,
    publishingPostsCount,
    stuckPublishingCount,
    failedPostsCount,
    nextScheduledPost,
    oldestDuePlatform,
    lastSuccessfulPublish: lastSuccessfulPublish as WorkerPublishAttemptSummary | null,
    lastFailedPublish: lastFailedPublish as WorkerPublishAttemptSummary | null,
    connectedPage: connectedPage
      ? {
          pageName: connectedPage.pageName,
          pageId: connectedPage.pageId,
          status: connectedPage.status,
          lastTestedAt: connectedPage.lastTestedAt,
          isConnected: connectedPage.status === ConnectedAccountStatus.CONNECTED,
        }
      : null,
  };
}
