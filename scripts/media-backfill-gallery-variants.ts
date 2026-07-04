import { backfillGalleryMediaVariants } from "@/lib/uploads";

async function main() {
  const summary = await backfillGalleryMediaVariants();

  console.log("Gallery thumbnail/preview backfill complete.");
  console.log(`Scanned assets: ${summary.scanned}`);
  console.log(`Updated assets: ${summary.updated}`);
  console.log(`Already complete: ${summary.skipped}`);
  console.log(`Failed assets: ${summary.failed}`);

  if (summary.failures.length > 0) {
    console.log("Failures:");
    for (const failure of summary.failures) {
      console.log(`- ${failure.mediaAssetId} :: ${failure.originalFilename} :: ${failure.message}`);
    }
  }
}

main().catch((error) => {
  console.error("Gallery thumbnail/preview backfill failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
