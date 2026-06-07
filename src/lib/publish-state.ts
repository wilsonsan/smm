import { Prisma, SocialPostStatus } from "@prisma/client";

const PENDING_PLATFORM_STATUSES: SocialPostStatus[] = [
  SocialPostStatus.DRAFT,
  SocialPostStatus.SCHEDULED,
  SocialPostStatus.CANCELLED,
];

function deriveAggregateSocialPostState(platformStatuses: SocialPostStatus[]) {
  if (platformStatuses.length === 0) {
    return {
      status: SocialPostStatus.DRAFT,
      publishedAt: null as Date | null,
      failureReason: null as string | null,
    };
  }

  if (platformStatuses.every((status) => status === SocialPostStatus.PUBLISHED)) {
    return {
      status: SocialPostStatus.PUBLISHED,
      publishedAt: "ALL_PUBLISHED" as const,
      failureReason: null as string | null,
    };
  }

  if (platformStatuses.some((status) => status === SocialPostStatus.FAILED)) {
    return {
      status: SocialPostStatus.FAILED,
      publishedAt: null as Date | null,
      failureReason: "FIRST_PLATFORM_ERROR" as const,
    };
  }

  if (
    platformStatuses.some((status) => status === SocialPostStatus.PUBLISHING) ||
    (platformStatuses.some((status) => status === SocialPostStatus.PUBLISHED) &&
      platformStatuses.some((status) => PENDING_PLATFORM_STATUSES.includes(status)))
  ) {
    return {
      status: SocialPostStatus.PUBLISHING,
      publishedAt: null as Date | null,
      failureReason: null as string | null,
    };
  }

  if (platformStatuses.some((status) => status === SocialPostStatus.SCHEDULED)) {
    return {
      status: SocialPostStatus.SCHEDULED,
      publishedAt: null as Date | null,
      failureReason: null as string | null,
    };
  }

  if (platformStatuses.some((status) => status === SocialPostStatus.DRAFT)) {
    return {
      status: SocialPostStatus.DRAFT,
      publishedAt: null as Date | null,
      failureReason: null as string | null,
    };
  }

  if (platformStatuses.every((status) => status === SocialPostStatus.CANCELLED)) {
    return {
      status: SocialPostStatus.CANCELLED,
      publishedAt: null as Date | null,
      failureReason: null as string | null,
    };
  }

  return {
    status: SocialPostStatus.DRAFT,
    publishedAt: null as Date | null,
    failureReason: null as string | null,
  };
}

export async function syncSocialPostAggregateState(
  db: Prisma.TransactionClient,
  socialPostId: string,
  options?: {
    failureReason?: string | null;
  },
) {
  const platforms = await db.socialPostPlatform.findMany({
    where: {
      socialPostId,
    },
    select: {
      status: true,
      publishedAt: true,
      lastError: true,
    },
  });

  const aggregate = deriveAggregateSocialPostState(platforms.map((platform) => platform.status));
  const publishedAt =
    aggregate.publishedAt === "ALL_PUBLISHED"
      ? platforms
          .map((platform) => platform.publishedAt)
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
      : null;
  const failureReason =
    aggregate.failureReason === "FIRST_PLATFORM_ERROR"
      ? options?.failureReason ||
        platforms.find((platform) => platform.status === SocialPostStatus.FAILED)?.lastError ||
        null
      : null;

  await db.socialPost.update({
    where: {
      id: socialPostId,
    },
    data: {
      status: aggregate.status,
      publishedAt,
      failureReason,
    },
  });
}
