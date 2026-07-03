import { getWorkerStatusOverview } from "../src/lib/worker-status";

async function main() {
  const status = await getWorkerStatusOverview();

  if (!status.runsAutomatically) {
    return;
  }

  if (status.workerHealthStatus === "critical") {
    console.error(`[healthcheck] Worker unhealthy: ${status.workerHealthMessage}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[healthcheck] Worker probe crashed.", error);
  process.exit(1);
});
