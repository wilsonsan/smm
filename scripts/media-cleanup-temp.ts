import { cleanupTemporaryPlatformImagesOlderThan } from "@/lib/uploads";

async function main() {
  const summary = await cleanupTemporaryPlatformImagesOlderThan({ maxAgeHours: 24 });

  console.log("Temporary media cleanup complete.");
  console.log(`Scanned files: ${summary.scannedFiles}`);
  console.log(`Deleted files: ${summary.deletedFiles}`);
  console.log(`Failed deletes: ${summary.failedDeletes}`);

  if (summary.failedPaths.length > 0) {
    console.log("Failed paths:");
    for (const failedPath of summary.failedPaths) {
      console.log(`- ${failedPath.path} :: ${failedPath.message}`);
    }
  }
}

main().catch((error) => {
  console.error("Temporary media cleanup failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
