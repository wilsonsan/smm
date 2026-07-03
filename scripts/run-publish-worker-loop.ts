import { env } from "../src/lib/env";
import { publishScheduledPosts } from "../src/lib/worker/publishScheduledPosts";
import { recordWorkerHeartbeat } from "../src/lib/worker-status";

const MINIMUM_POLL_INTERVAL_MS = 5_000;
const pollIntervalMs = Math.max(env.WORKER_POLL_INTERVAL_MS, MINIMUM_POLL_INTERVAL_MS);

let shouldStop = false;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requestStop(signal: NodeJS.Signals) {
  if (shouldStop) {
    return;
  }

  shouldStop = true;
  console.log(`[publish worker] Received ${signal}. Finishing the current cycle before exit.`);
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

async function main() {
  console.log(`[publish worker] Starting background loop with a ${pollIntervalMs}ms interval.`);
  await recordWorkerHeartbeat({
    state: "starting",
  }).catch(() => undefined);

  while (!shouldStop) {
    const cycleStartedAt = new Date();
    await recordWorkerHeartbeat({
      at: cycleStartedAt,
      state: "claiming",
    }).catch(() => undefined);

    try {
      const result = await publishScheduledPosts();
      const hasWorkerActivity =
        result.claimedCount > 0 ||
        result.publishedCount > 0 ||
        result.failedCount > 0 ||
        result.skippedCount > 0 ||
        result.recoveredCount > 0;

      if (hasWorkerActivity) {
        console.log(
          JSON.stringify(
            {
              type: "publish-worker-cycle",
              startedAt: cycleStartedAt.toISOString(),
              finishedAt: new Date().toISOString(),
              pollIntervalMs,
              result,
            },
            null,
            2,
          ),
        );
      }

      await recordWorkerHeartbeat({
        state: "idle",
      }).catch(() => undefined);
    } catch (error) {
      await recordWorkerHeartbeat({
        state: "error",
      }).catch(() => undefined);
      console.error("[publish worker] Background cycle failed.", error);
    }

    if (shouldStop) {
      break;
    }

    await wait(pollIntervalMs);
  }

  await recordWorkerHeartbeat({
    state: "stopping",
  }).catch(() => undefined);
  console.log("[publish worker] Background loop stopped.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
