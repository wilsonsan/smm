import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import {
  assignMediaAssetCategories,
  getExistingMediaCategoriesByIds,
  normalizeCategoryIdList,
  replaceMediaAssetCategories,
} from "@/lib/media-category-service";
import { toMediaAssetGallerySummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { mediaAssetCategoryUpdateSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    mediaAssetId: string;
  }>;
};

async function loadMediaAsset(mediaAssetId: string) {
  return prisma.mediaAsset.findUnique({
    where: {
      id: mediaAssetId,
    },
    include: {
      categoryAssignments: {
        include: {
          mediaCategory: true,
        },
      },
      variants: true,
      posts: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
          updatedAt: true,
          platforms: {
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
  });
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request);
    const requestMetadata = getRequestMetadataFromRequest(request);

    await enforceRateLimit(RATE_LIMITS.api.galleryBrowsing, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-assets/categories",
      method: requestMetadata.method,
      attemptedAction: "update_media_asset_categories",
    });

    const { mediaAssetId } = await context.params;
    const parsed = mediaAssetCategoryUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Fix the selected categories and try again.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: {
        id: mediaAssetId,
      },
      select: {
        id: true,
      },
    });

    if (!mediaAsset) {
      return NextResponse.json({ error: "That media item no longer exists." }, { status: 404 });
    }

    const categoryIds = normalizeCategoryIdList(parsed.data.categoryIds);
    const categories = await getExistingMediaCategoriesByIds(categoryIds);

    if (categories.length !== categoryIds.length) {
      return NextResponse.json({ error: "One or more categories no longer exist." }, { status: 404 });
    }

    if (parsed.data.mode === "replace") {
      await replaceMediaAssetCategories(mediaAssetId, categoryIds);
    } else if (parsed.data.mode === "assign") {
      await assignMediaAssetCategories(mediaAssetId, categoryIds);
    } else {
      await replaceMediaAssetCategories(mediaAssetId, []);
    }

    const refreshedAsset = await loadMediaAsset(mediaAssetId);
    if (!refreshedAsset) {
      return NextResponse.json({ error: "That media item no longer exists." }, { status: 404 });
    }

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action:
        parsed.data.mode === "clear" ? AUDIT_ACTIONS.MEDIA_CATEGORIES_CLEARED : AUDIT_ACTIONS.MEDIA_CATEGORIES_ASSIGNED,
      targetType: "MediaAsset",
      targetId: mediaAssetId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        mode: parsed.data.mode,
        categoryIds,
      },
    });

    return NextResponse.json({
      mediaAsset: toMediaAssetGallerySummary(refreshedAsset),
    });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: buildRateLimitHeaders(error) });
    }

    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update media categories.",
      },
      { status: 400 },
    );
  }
}
