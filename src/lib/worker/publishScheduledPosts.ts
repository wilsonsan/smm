import { PublishAttemptStatus, SocialPlatform, SocialPostStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PublishWorkerResult = {
  claimedCount: number;
  placeholderCount: number;
};

export async function publishScheduledPosts(): Promise<PublishWorkerResult> {
  const now = new Date();

  const claimedPlatformIds = await prisma.$transaction(async (tx) => {
    const duePlatforms = await tx.socialPostPlatform.findMany({
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

    const claimed: string[] = [];

    for (const platform of duePlatforms) {
      const claimResult = await tx.socialPostPlatform.updateMany({
        where: {
          id: platform.id,
          status: SocialPostStatus.SCHEDULED,
        },
        data: {
          status: SocialPostStatus.PUBLISHING,
        },
      });

      if (claimResult.count !== 1) {
        continue;
      }

      await tx.socialPost.updateMany({
        where: {
          id: platform.socialPostId,
          status: SocialPostStatus.SCHEDULED,
        },
        data: {
          status: SocialPostStatus.PUBLISHING,
          failureReason: null,
        },
      });

      claimed.push(platform.id);
    }

    return claimed;
  });

  for (const platformId of claimedPlatformIds) {
    await prisma.$transaction(async (tx) => {
      const platform = await tx.socialPostPlatform.findUniqueOrThrow({
        where: { id: platformId },
        include: { socialPost: true },
      });

      const placeholderMessage =
        "Publish skipped by development placeholder. Wire Facebook Graph API publishing here in a later phase.";

      await tx.publishAttempt.create({
        data: {
          socialPostPlatformId: platform.id,
          status: PublishAttemptStatus.SKIPPED_DEV_PLACEHOLDER,
          message: placeholderMessage,
          responsePayload: {
            todo: "Implement Facebook Graph API publishing after account connection work lands.",
            scheduledAt: platform.scheduledAt?.toISOString() ?? null,
          },
        },
      });

      // TODO: Replace this placeholder branch with a real publish call and success/failure mapping per platform.
      await tx.socialPostPlatform.update({
        where: { id: platform.id },
        data: {
          status: SocialPostStatus.FAILED,
          lastError: placeholderMessage,
        },
      });

      await tx.socialPost.update({
        where: { id: platform.socialPostId },
        data: {
          status: SocialPostStatus.FAILED,
          failureReason: placeholderMessage,
        },
      });
    });
  }

  return {
    claimedCount: claimedPlatformIds.length,
    placeholderCount: claimedPlatformIds.length,
  };
}

