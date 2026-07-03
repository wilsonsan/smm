import "server-only";

import { prisma } from "@/lib/prisma";
import { getWorkerStatusOverview } from "@/lib/worker-status";

export async function probeDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "healthy" as const,
      message: "Database is responding.",
    };
  } catch (error) {
    return {
      status: "critical" as const,
      message: error instanceof Error ? error.message : "Database probe failed.",
    };
  }
}

export async function getApplicationHealthSnapshot(options?: {
  includeWorker?: boolean;
}) {
  const checkedAt = new Date();
  const database = await probeDatabaseHealth();
  const worker = options?.includeWorker ? await getWorkerStatusOverview() : null;

  const overallStatus =
    database.status === "critical"
      ? "critical"
      : worker?.workerHealthStatus === "critical"
        ? "critical"
        : worker?.workerHealthStatus === "warning"
          ? "warning"
          : "healthy";

  return {
    checkedAt: checkedAt.toISOString(),
    overallStatus,
    app: {
      status: "healthy" as const,
      message: "App server is responding.",
    },
    database,
    worker:
      worker === null
        ? null
        : {
            status: worker.workerHealthStatus,
            message: worker.workerHealthMessage,
            runsAutomatically: worker.runsAutomatically,
            lastHeartbeatAt: worker.lastHeartbeatAt?.toISOString() ?? null,
            lastHeartbeatState: worker.lastHeartbeatState,
            dueScheduledPostsCount: worker.dueScheduledPostsCount,
            isBehindSchedule: worker.isBehindSchedule,
            isWorkerStale: worker.isWorkerStale,
            lastWorkerError: worker.lastWorkerError,
          },
  };
}
