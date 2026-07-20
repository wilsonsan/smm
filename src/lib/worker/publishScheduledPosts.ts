import { PublishAttemptStatus, SocialPlatform, SocialPostStatus } from "@prisma/client";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { claimFacebookPostForPublishing, executeFacebookPublish } from "@/lib/facebook";
import { claimGooglePostForPublishing, executeGooglePublish } from "@/lib/google";
import { claimInstagramPostForPublishing, executeInstagramPublish } from "@/lib/instagram";
import {
  isMetaInstagramPublishingEnabled,
  META_INSTAGRAM_NOT_ENABLED_MESSAGE,
} from "@/lib/meta-instagram-capability";
import { createOrUpdateWorkerErrorNotification, dismissWorkerErrorNotifications } from "@/lib/notifications";
import { syncSocialPostAggregateState } from "@/lib/publish-state";
import { prisma } from "@/lib/prisma";
import { recordWorkerHeartbeat, recordWorkerRunStatus, WORKER_PUBLISH_TIMEOUT_MINUTES } from "@/lib/worker-status";

type PublishWorkerResult = {
  claimedCount: number;
  publishedCount: number;
  failedCount: number;
  skippedCount: number;
  recoveredCount: number;
};

async function markUnsupportedInstagramPlatformFailed(input: { socialPostId: string }) {
  const finishedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const platformRecord = await tx.socialPostPlatform.findUnique({
      where: {
        socialPostId_platform: {
          socialPostId: input.socialPostId,
          platform: SocialPlatform.INSTAGRAM,
        },
      },
      select: {
        id: true,
        socialPostId: true,
        status: true,
        platformPostId: true,
        publishedAt: true,
      },
    });

    if (
      !platformRecord ||
      platformRecord.status !== SocialPostStatus.SCHEDULED ||
      platformRecord.platformPostId ||
      platformRecord.publishedAt
    ) {
      return false;
    }

    await tx.publishAttempt.create({
      data: {
        socialPostId: input.socialPostId,
        socialPostPlatformId: platformRecord.id,
        platform: SocialPlatform.INSTAGRAM,
        status: PublishAttemptStatus.FAILED,
        errorCode: "INSTAGRAM_DISABLED",
        errorMessage: META_INSTAGRAM_NOT_ENABLED_MESSAGE,
        requestSummary: {
          platform: SocialPlatform.INSTAGRAM,
          reason: "UNSUPPORTED_PLATFORM",
          capability: "disabled",
        },
        startedAt: finishedAt,
        finishedAt,
      },
    });

    await tx.socialPostPlatform.update({
      where: {
        id: platformRecord.id,
      },
      data: {
        status: SocialPostStatus.FAILED,
        lastError: META_INSTAGRAM_NOT_ENABLED_MESSAGE,
      },
    });

    await syncSocialPostAggregateState(tx, input.socialPostId, {
      failureReason: META_INSTAGRAM_NOT_ENABLED_MESSAGE,
    });

    return true;
  });
}

async function recoverStuckPublishingPosts(now: Date) {
  const cutoff = new Date(now.getTime() - WORKER_PUBLISH_TIMEOUT_MINUTES * 60 * 1000);
  const stuckPlatforms = await prisma.socialPostPlatform.findMany({
    where: {
      platform: {
        in: [SocialPlatform.FACEBOOK, SocialPlatform.INSTAGRAM, SocialPlatform.GOOGLE_BUSINESS],
      },
      status: SocialPostStatus.PUBLISHING,
      updatedAt: {
        lt: cutoff,
      },
    },
    select: {
      id: true,
      platform: true,
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
          platform: stuckPlatform.platform,
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

      await syncSocialPostAggregateState(tx, currentPlatform.socialPostId, {
        failureReason: timeoutMessage,
      });

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
        platform: stuckPlatform.platform,
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
        platform: stuckPlatform.platform,
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
      `[publish worker] Recovered stuck ${stuckPlatform.platform} publish ${stuckPlatform.socialPostId} (${stuckPlatform.socialPost.internalTitle}).`,
    );
  }

  return recoveredCount;
}

export async function publishScheduledPosts(): Promise<PublishWorkerResult> {
  const now = new Date();
  await recordWorkerHeartbeat({
    at: now,
    state: "claiming",
  }).catch(() => undefined);
  let publishedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let recoveredCount = 0;
  const claimedPlatformIds: string[] = [];

  try {
    recoveredCount = await recoverStuckPublishingPosts(now);

    const duePlatforms = await prisma.socialPostPlatform.findMany({
      where: {
        platform: {
          in: [SocialPlatform.FACEBOOK, SocialPlatform.INSTAGRAM, SocialPlatform.GOOGLE_BUSINESS],
        },
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
        platform: true,
      },
    });

    for (const platform of duePlatforms) {
      await recordWorkerHeartbeat({
        state: "claiming",
      }).catch(() => undefined);

      if (platform.platform === SocialPlatform.INSTAGRAM && !isMetaInstagramPublishingEnabled()) {
        const markedFailed = await markUnsupportedInstagramPlatformFailed({
          socialPostId: platform.socialPostId,
        });

        if (markedFailed) {
          failedCount += 1;
          await createAuditLog({
            action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
            targetType: "SocialPost",
            targetId: platform.socialPostId,
            metadata: {
              previousStatus: SocialPostStatus.SCHEDULED,
              nextStatus: SocialPostStatus.FAILED,
              mode: "worker",
              platform: platform.platform,
              message: META_INSTAGRAM_NOT_ENABLED_MESSAGE,
              reason: "UNSUPPORTED_PLATFORM",
            },
          });
          await createAuditLog({
            action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
            targetType: "SocialPost",
            targetId: platform.socialPostId,
            metadata: {
              previousStatus: SocialPostStatus.SCHEDULED,
              nextStatus: SocialPostStatus.FAILED,
              mode: "worker",
            },
          });
          console.log(
            `[publish worker] Marked Instagram platform ${platform.socialPostId} as unsupported because Instagram publishing is disabled.`,
          );
        } else {
          skippedCount += 1;
        }

        continue;
      }

      const claim =
        platform.platform === SocialPlatform.GOOGLE_BUSINESS
          ? await claimGooglePostForPublishing({
              socialPostId: platform.socialPostId,
              allowedStatuses: [SocialPostStatus.SCHEDULED],
            })
          : platform.platform === SocialPlatform.INSTAGRAM
            ? await claimInstagramPostForPublishing({
                socialPostId: platform.socialPostId,
                allowedStatuses: [SocialPostStatus.SCHEDULED],
              })
          : await claimFacebookPostForPublishing({
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
            platform: platform.platform,
            reason: claim.reason,
            message: claim.message,
          },
        });
        console.log(`[publish worker] Skipped ${platform.platform} ${platform.socialPostId}: ${claim.reason} - ${claim.message}`);
        continue;
      }

      claimedPlatformIds.push(claim.socialPostPlatformId);
    }

    for (const platformId of claimedPlatformIds) {
      const platform = await prisma.socialPostPlatform.findUniqueOrThrow({
        where: { id: platformId },
        select: {
          id: true,
          socialPostId: true,
          platform: true,
        },
      });

      await recordWorkerHeartbeat({
        state: "publishing",
      }).catch(() => undefined);

      await createAuditLog({
        action: AUDIT_ACTIONS.POST_PUBLISH_STARTED,
        targetType: "SocialPost",
        targetId: platform.socialPostId,
        metadata: {
          previousStatus: SocialPostStatus.SCHEDULED,
          nextStatus: SocialPostStatus.PUBLISHING,
          mode: "worker",
          platform: platform.platform,
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
        const result =
          platform.platform === SocialPlatform.GOOGLE_BUSINESS
            ? await executeGooglePublish({
                socialPostId: platform.socialPostId,
                socialPostPlatformId: platformId,
              })
            : platform.platform === SocialPlatform.INSTAGRAM
              ? await executeInstagramPublish({
                  socialPostId: platform.socialPostId,
                  socialPostPlatformId: platformId,
                })
            : await executeFacebookPublish({
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
            platform: platform.platform,
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

        console.log(`[publish worker] Published ${platform.platform} platform record ${platformId}.`);
      } catch (error) {
        failedCount += 1;
        const message =
          error instanceof Error
            ? error.message
            : platform.platform === SocialPlatform.INSTAGRAM
              ? "Instagram publishing failed."
            : platform.platform === SocialPlatform.GOOGLE_BUSINESS
              ? "Google Business publishing failed."
              : "Facebook publishing failed.";

        await createAuditLog({
          action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
          targetType: "SocialPost",
          targetId: platform.socialPostId,
          metadata: {
            previousStatus: SocialPostStatus.PUBLISHING,
            nextStatus: SocialPostStatus.FAILED,
            mode: "worker",
            platform: platform.platform,
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

        console.log(`[publish worker] ${platform.platform} publish for platform record ${platformId} failed: ${message}`);
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
    const hasWorkerActivity =
      result.claimedCount > 0 ||
      result.publishedCount > 0 ||
      result.failedCount > 0 ||
      result.skippedCount > 0 ||
      result.recoveredCount > 0;

    if (hasWorkerActivity) {
      console.log(
        `[publish worker] Cycle ${now.toISOString()} claimed=${result.claimedCount} published=${result.publishedCount} failed=${result.failedCount} skipped=${result.skippedCount} recovered=${result.recoveredCount}.`,
      );
    }

    if (hasWorkerActivity) {
      await createAuditLog({
        action: AUDIT_ACTIONS.WORKER_RUN_COMPLETED,
        targetType: "Worker",
        targetId: "social-publish-worker",
        metadata: {
          finishedAt: finishedAt.toISOString(),
          result,
          errorMessage: failedCount > 0 ? "One or more scheduled platform publishes failed." : null,
        },
      });
    }

    await recordWorkerRunStatus({
      finishedAt,
      result,
      errorMessage: failedCount > 0 ? "One or more scheduled platform publishes failed." : null,
    });

    if (failedCount === 0) {
      await dismissWorkerErrorNotifications();
    }

    await recordWorkerHeartbeat({
      state: "idle",
    }).catch(() => undefined);

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
      targetId: "social-publish-worker",
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
    await recordWorkerHeartbeat({
      state: "error",
    }).catch(() => undefined);
    await createOrUpdateWorkerErrorNotification({
      message,
    });

    throw error;
  }
}
