import { SocialPostStatus } from "@prisma/client";
import { MediaLibraryBrowser } from "@/components/media-library-browser";
import { toMediaAssetGallerySummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";
import { getResolvedAppTimezone } from "@/lib/time";

export default async function MediaPage() {
  const [mediaAssets, timezone] = await Promise.all([
    prisma.mediaAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        variants: true,
        posts: {
          select: {
            platforms: {
              where: {
                status: {
                  in: [
                    SocialPostStatus.SCHEDULED,
                    SocialPostStatus.PUBLISHING,
                    SocialPostStatus.PUBLISHED,
                  ],
                },
              },
              select: {
                platform: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    getResolvedAppTimezone(),
  ]);

  return <MediaLibraryBrowser assets={mediaAssets.map((asset) => toMediaAssetGallerySummary(asset))} timezone={timezone} />;
}
