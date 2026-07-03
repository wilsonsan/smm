const HEALTH_URL = "http://127.0.0.1:3000/api/health/app";

async function main() {
  const response = await fetch(HEALTH_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[healthcheck] App probe failed with ${response.status}. ${body}`);
    process.exit(1);
  }

  const payload = (await response.json()) as { overallStatus?: string };
  if (!payload || payload.overallStatus === "critical") {
    console.error("[healthcheck] App probe returned a critical state.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[healthcheck] App probe crashed.", error);
  process.exit(1);
});
