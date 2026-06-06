import { cleanupStoredPermanentMediaVariants } from "@/lib/uploads";

async function main() {
  const summary = await cleanupStoredPermanentMediaVariants();

  console.log("Permanent media variant cleanup complete.");
  console.log(`Found variants: ${summary.foundVariants}`);
  console.log(`Deleted files: ${summary.deletedFiles}`);
  console.log(`Missing files: ${summary.missingFiles}`);
  console.log(`Failed deletes: ${summary.failedDeletes}`);
  console.log(`Deleted records: ${summary.deletedRecords}`);

  if (summary.failedPaths.length > 0) {
    console.log("Failed paths:");
    for (const failedPath of summary.failedPaths) {
      console.log(`- ${failedPath.variantId} :: ${failedPath.storagePath} :: ${failedPath.message}`);
    }
  }
}

main().catch((error) => {
  console.error("Permanent media variant cleanup failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
