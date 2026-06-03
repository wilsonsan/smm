import { publishScheduledPosts } from "../src/lib/worker/publishScheduledPosts";

async function main() {
  const result = await publishScheduledPosts();

  console.log(
    JSON.stringify(
      {
        claimedCount: result.claimedCount,
        placeholderCount: result.placeholderCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

