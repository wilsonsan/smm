import {
  ConnectedAccountStatus,
  PublishAttemptStatus,
  SocialPlatform,
  SocialPostStatus,
} from "@prisma/client";
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

export async function getWorkerStatusOverview() {
  const [
    lastRunAt,
    lastResultValue,
    lastError,
    dueScheduledPostsCount,
    publishingPostsCount,
    failedPostsCount,
    nextScheduledPost,
    lastSuccessfulPublish,
    lastFailedPublish,
    stuckPublishingCount,
    connectedPage,
  ] =
    await Promise.all([
      getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_RUN_AT),
      getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_RESULT),
      getAppSettingValue(APP_SETTING_KEYS.WORKER_LAST_ERROR),
      prisma.socialPostPlatform.count({
        where: {
          platform: SocialPlatform.FACEBOOK,
          status: SocialPostStatus.SCHEDULED,
          scheduledAt: {
            lte: new Date(),
          },
        },
      }),
      prisma.socialPostPlatform.count({
        where: {
          platform: SocialPlatform.FACEBOOK,
          status: SocialPostStatus.PUBLISHING,
        },
      }),
      prisma.socialPostPlatform.count({
        where: {
          platform: SocialPlatform.FACEBOOK,
          status: SocialPostStatus.FAILED,
        },
      }),
      prisma.socialPost.findFirst({
        where: {
          status: SocialPostStatus.SCHEDULED,
          platforms: {
            some: {
              platform: SocialPlatform.FACEBOOK,
            },
          },
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
      prisma.publishAttempt.findFirst({
        where: {
          platform: SocialPlatform.FACEBOOK,
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
          platform: SocialPlatform.FACEBOOK,
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
          platform: SocialPlatform.FACEBOOK,
          status: SocialPostStatus.PUBLISHING,
          updatedAt: {
            lt: new Date(Date.now() - WORKER_PUBLISH_TIMEOUT_MINUTES * 60 * 1000),
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

  return {
    enabled: true,
    mode: "Manual cron command",
    lastRunAt: lastRunAt ? new Date(lastRunAt) : null,
    lastRunResult: parsedLastResult,
    lastWorkerError: lastError || null,
    dueScheduledPostsCount,
    publishingPostsCount,
    stuckPublishingCount,
    failedPostsCount,
    nextScheduledPost,
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
