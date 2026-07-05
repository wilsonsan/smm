import { SocialPostStatus } from "@prisma/client";
import { MediaLibraryBrowser } from "@/components/media-library-browser";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { buildGalleryCategorySummaries, canManageGalleryStructure, getTrackedMediaStorageBytes } from "@/lib/media-gallery";
import { toMediaAssetGallerySummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { getResolvedAppTimezone } from "@/lib/time";

export default async function MediaPage() {
  const adminUser = await requireAuthenticatedUser();
  const [mediaAssets, mediaCategories, timezone, appSettings] = await Promise.all([
    prisma.mediaAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        variants: true,
        categoryAssignments: {
          include: {
            mediaCategory: true,
          },
        },
        posts: {
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
            updatedAt: true,
            platforms: {
              where: {
                status: {
                  in: [
                    SocialPostStatus.DRAFT,
                    SocialPostStatus.SCHEDULED,
                    SocialPostStatus.PUBLISHING,
                    SocialPostStatus.PUBLISHED,
                    SocialPostStatus.FAILED,
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
        attachedToPosts: {
          select: {
            socialPost: {
              select: {
                id: true,
                status: true,
                scheduledAt: true,
                publishedAt: true,
                updatedAt: true,
                platforms: {
                  where: {
                    status: {
                      in: [
                        SocialPostStatus.DRAFT,
                        SocialPostStatus.SCHEDULED,
                        SocialPostStatus.PUBLISHING,
                        SocialPostStatus.PUBLISHED,
                        SocialPostStatus.FAILED,
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
        },
      },
    }),
    prisma.mediaCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getResolvedAppTimezone(),
    getAppSettings(),
  ]);
  const assetSummaries = mediaAssets.map((asset) => toMediaAssetGallerySummary(asset));
  const categories = buildGalleryCategorySummaries({
    categories: mediaCategories,
    assets: assetSummaries,
  });

  return (
    <MediaLibraryBrowser
      assets={assetSummaries}
      categories={categories}
      timezone={timezone}
      canManageCategories={canManageGalleryStructure(adminUser.role)}
      trackedStorageBytes={getTrackedMediaStorageBytes(assetSummaries)}
      galleryStorageLimitGb={appSettings.galleryStorageLimitGb}
    />
  );
}
