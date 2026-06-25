import { prisma } from "@/lib/prisma";

function createWindowStart(windowMinutes: number) {
  return new Date(Date.now() - windowMinutes * 60 * 1000);
}

export async function countFailedAuthAttemptsByIp(input: {
  actions: string[];
  ipAddress: string | null;
  windowMinutes: number;
}) {
  if (!input.ipAddress) {
    return 0;
  }

  return prisma.auditLog.count({
    where: {
      action: {
        in: input.actions,
      },
      ipAddress: input.ipAddress,
      createdAt: {
        gte: createWindowStart(input.windowMinutes),
      },
    },
  });
}

export async function isFailedAuthRateLimitedByIp(input: {
  actions: string[];
  ipAddress: string | null;
  windowMinutes: number;
  maxAttempts: number;
}) {
  const attemptCount = await countFailedAuthAttemptsByIp(input);
  return attemptCount >= input.maxAttempts;
}
