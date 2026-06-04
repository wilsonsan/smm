import { PublishAttemptStatus, SocialPlatform, SocialPostStatus } from "@prisma/client";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { claimFacebookPostForPublishing, executeFacebookPublish } from "@/lib/facebook";
import { prisma } from "@/lib/prisma";
import { recordWorkerRunStatus, WORKER_PUBLISH_TIMEOUT_MINUTES } from "@/lib/worker-status";

type PublishWorkerResult = {
  claimedCount: number;
  publishedCount: number;
  failedCount: number;
  skippedCount: number;
  recoveredCount: number;
};

async function recoverStuckPublishingPosts(now: Date) {
  const cutoff = new Date(now.getTime() - WORKER_PUBLISH_TIMEOUT_MINUTES * 60 * 1000);
  const stuckPlatforms = await prisma.socialPostPlatform.findMany({
    where: {
      platform: SocialPlatform.FACEBOOK,
      status: SocialPostStatus.PUBLISHING,
      updatedAt: {
        lt: cutoff,
      },
    },
    select: {
      id: true,
      socialPostId: true,
      updatedAt: true,
      socialPost: {
        select: {
          internalTitle: true,
          status: true,
        },
      },
    },
  });

  let recoveredCount = 0;

  for (const stuckPlatform of stuckPlatforms) {
    const timeoutMessage = `Worker recovery marked this publish as failed after ${WORKER_PUBLISH_TIMEOUT_MINUTES} minutes in PUBLISHING.`;
    const finishedAt = new Date();

    const recovered = await prisma.$transaction(async (tx) => {
      const currentPlatform = await tx.socialPostPlatform.findUnique({
        where: {
          id: stuckPlatform.id,
        },
        select: {
          id: true,
          status: true,
          platformPostId: true,
          socialPostId: true,
          socialPost: {
            select: {
              status: true,
            },
          },
        },
      });

      if (!currentPlatform || currentPlatform.status !== SocialPostStatus.PUBLISHING || currentPlatform.platformPostId) {
        return false;
      }

      await tx.publishAttempt.updateMany({
        where: {
          socialPostPlatformId: currentPlatform.id,
          platform: SocialPlatform.FACEBOOK,
          status: PublishAttemptStatus.PENDING,
          finishedAt: null,
        },
        data: {
          status: PublishAttemptStatus.FAILED,
          errorCode: "WORKER_TIMEOUT",
          errorMessage: timeoutMessage,
          finishedAt,
        },
      });

      await tx.socialPostPlatform.update({
        where: {
          id: currentPlatform.id,
        },
        data: {
          status: SocialPostStatus.FAILED,
          lastError: timeoutMessage,
        },
      });

      if (currentPlatform.socialPost.status === SocialPostStatus.PUBLISHING) {
        await tx.socialPost.update({
          where: {
            id: currentPlatform.socialPostId,
          },
          data: {
            status: SocialPostStatus.FAILED,
            failureReason: timeoutMessage,
          },
        });
      }

      return true;
    });

    if (!recovered) {
      continue;
    }

    recoveredCount += 1;

    await createAuditLog({
      action: AUDIT_ACTIONS.WORKER_STUCK_PUBLISHING_RECOVERED,
      targetType: "SocialPost",
      targetId: stuckPlatform.socialPostId,
      metadata: {
        platform: SocialPlatform.FACEBOOK,
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.FAILED,
        timeoutMinutes: WORKER_PUBLISH_TIMEOUT_MINUTES,
        previousUpdatedAt: stuckPlatform.updatedAt.toISOString(),
        message: timeoutMessage,
      },
    });

    await createAuditLog({
      action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
      targetType: "SocialPost",
      targetId: stuckPlatform.socialPostId,
      metadata: {
        mode: "worker-recovery",
        platform: SocialPlatform.FACEBOOK,
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.FAILED,
        message: timeoutMessage,
      },
    });

    await createAuditLog({
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetType: "SocialPost",
      targetId: stuckPlatform.socialPostId,
      metadata: {
        mode: "worker-recovery",
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.FAILED,
      },
    });

    console.log(
      `[publish worker] Recovered stuck Facebook publish ${stuckPlatform.socialPostId} (${stuckPlatform.socialPost.internalTitle}).`,
    );
  }

  return recoveredCount;
}

export async function publishScheduledPosts(): Promise<PublishWorkerResult> {
  const now = new Date();
  let publishedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let recoveredCount = 0;
  const claimedPlatformIds: string[] = [];

  try {
    recoveredCount = await recoverStuckPublishingPosts(now);

    const duePlatforms = await prisma.socialPostPlatform.findMany({
      where: {
        platform: SocialPlatform.FACEBOOK,
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: {
          lte: now,
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
      take: 25,
      select: {
        id: true,
        socialPostId: true,
      },
    });

    for (const platform of duePlatforms) {
      const claim = await claimFacebookPostForPublishing({
        socialPostId: platform.socialPostId,
        allowedStatuses: [SocialPostStatus.SCHEDULED],
      });

      if (!claim.ok) {
        skippedCount += 1;
        await createAuditLog({
          action: AUDIT_ACTIONS.POST_PUBLISH_SKIPPED,
          targetType: "SocialPost",
          targetId: platform.socialPostId,
          metadata: {
            mode: "worker",
            platform: SocialPlatform.FACEBOOK,
            reason: claim.reason,
            message: claim.message,
          },
        });
        console.log(`[publish worker] Skipped ${platform.socialPostId}: ${claim.reason} - ${claim.message}`);
        continue;
      }

      claimedPlatformIds.push(claim.socialPostPlatformId);
    }

    console.log(
      `[publish worker] Claimed ${claimedPlatformIds.length} scheduled Facebook post(s) at ${now.toISOString()}.`,
    );

    for (const platformId of claimedPlatformIds) {
      const platform = await prisma.socialPostPlatform.findUniqueOrThrow({
        where: { id: platformId },
        select: {
          id: true,
          socialPostId: true,
        },
      });

      await createAuditLog({
        action: AUDIT_ACTIONS.POST_PUBLISH_STARTED,
        targetType: "SocialPost",
        targetId: platform.socialPostId,
        metadata: {
          previousStatus: SocialPostStatus.SCHEDULED,
          nextStatus: SocialPostStatus.PUBLISHING,
          mode: "worker",
          platform: SocialPlatform.FACEBOOK,
        },
      });

      await createAuditLog({
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetType: "SocialPost",
        targetId: platform.socialPostId,
        metadata: {
          previousStatus: SocialPostStatus.SCHEDULED,
          nextStatus: SocialPostStatus.PUBLISHING,
          mode: "worker",
        },
      });

      try {
        const result = await executeFacebookPublish({
          socialPostId: platform.socialPostId,
          socialPostPlatformId: platformId,
        });

        publishedCount += 1;

        await createAuditLog({
          action: AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
          targetType: "SocialPost",
          targetId: platform.socialPostId,
          metadata: {
            previousStatus: SocialPostStatus.PUBLISHING,
            nextStatus: SocialPostStatus.PUBLISHED,
            mode: "worker",
            publishedAt: result.finishedAt.toISOString(),
            platform: SocialPlatform.FACEBOOK,
            platformPostId: result.result.platformPostId,
            platformPostUrl: result.result.platformPostUrl,
          },
        });

        await createAuditLog({
          action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
          targetType: "SocialPost",
          targetId: platform.socialPostId,
          metadata: {
            previousStatus: SocialPostStatus.PUBLISHING,
            nextStatus: SocialPostStatus.PUBLISHED,
            mode: "worker",
          },
        });

        console.log(`[publish worker] Published Facebook platform record ${platformId}.`);
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : "Facebook publishing failed.";

        await createAuditLog({
          action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
          targetType: "SocialPost",
          targetId: platform.socialPostId,
          metadata: {
            previousStatus: SocialPostStatus.PUBLISHING,
            nextStatus: SocialPostStatus.FAILED,
            mode: "worker",
            platform: SocialPlatform.FACEBOOK,
            message,
          },
        });

        await createAuditLog({
          action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
          targetType: "SocialPost",
          targetId: platform.socialPostId,
          metadata: {
            previousStatus: SocialPostStatus.PUBLISHING,
            nextStatus: SocialPostStatus.FAILED,
            mode: "worker",
          },
        });

        console.log(`[publish worker] Facebook publish for platform record ${platformId} failed: ${message}`);
      }
    }

    const result = {
      claimedCount: claimedPlatformIds.length,
      publishedCount,
      failedCount,
      skippedCount,
      recoveredCount,
    };
    const finishedAt = new Date();

    await createAuditLog({
      action: AUDIT_ACTIONS.WORKER_RUN_COMPLETED,
      targetType: "Worker",
      targetId: "facebook-publish-worker",
      metadata: {
        finishedAt: finishedAt.toISOString(),
        result,
        errorMessage: failedCount > 0 ? "One or more scheduled Facebook publishes failed." : null,
      },
    });

    await recordWorkerRunStatus({
      finishedAt,
      result,
      errorMessage: failedCount > 0 ? "One or more scheduled Facebook publishes failed." : null,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker run failed.";
    const result = {
      claimedCount: claimedPlatformIds.length,
      publishedCount,
      failedCount,
      skippedCount,
      recoveredCount,
    };
    const finishedAt = new Date();

    await createAuditLog({
      action: AUDIT_ACTIONS.WORKER_RUN_COMPLETED,
      targetType: "Worker",
      targetId: "facebook-publish-worker",
      metadata: {
        finishedAt: finishedAt.toISOString(),
        result,
        errorMessage: message,
      },
    });

    await recordWorkerRunStatus({
      finishedAt,
      result,
      errorMessage: message,
    });

    throw error;
  }
}
