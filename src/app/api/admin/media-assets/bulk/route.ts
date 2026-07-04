import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { canAccessOwnedResource, requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { getExistingMediaCategoriesByIds, normalizeCategoryIdList, updateMediaAssetCategoriesBulk } from "@/lib/media-category-service";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { deleteStoredMediaAsset } from "@/lib/uploads";
import { bulkMediaActionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request);
    const requestMetadata = getRequestMetadataFromRequest(request);

    await enforceRateLimit(RATE_LIMITS.api.galleryBrowsing, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-assets/bulk",
      method: requestMetadata.method,
      attemptedAction: "bulk_media_action",
    });

    const parsed = bulkMediaActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Fix the bulk action and try again.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const mediaAssetIds = normalizeCategoryIdList(parsed.data.mediaAssetIds);
    const mediaAssets = await prisma.mediaAsset.findMany({
      where: {
        id: {
          in: mediaAssetIds,
        },
      },
      select: {
        id: true,
        createdByAdminUserId: true,
      },
    });

    if (mediaAssets.length !== mediaAssetIds.length) {
      return NextResponse.json({ error: "One or more selected media items no longer exist." }, { status: 404 });
    }

    if (parsed.data.action === "deleteSelected") {
      let deletedCount = 0;
      let blockedCount = 0;
      let forbiddenCount = 0;

      for (const mediaAsset of mediaAssets) {
        if (!canAccessOwnedResource(session.adminUser, mediaAsset.createdByAdminUserId)) {
          forbiddenCount += 1;
          continue;
        }

        const result = await deleteStoredMediaAsset({ mediaAssetId: mediaAsset.id });
        if (result.status === "blocked") {
          blockedCount += 1;
          continue;
        }

        deletedCount += 1;
      }

      await createAuditLog({
        actorAdminUserId: session.adminUserId,
        action: AUDIT_ACTIONS.MEDIA_BULK_DELETED,
        targetType: "MediaAsset",
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        metadata: {
          requestedCount: mediaAssetIds.length,
          deletedCount,
          blockedCount,
          forbiddenCount,
        },
      });

      return NextResponse.json({
        ok: true,
        deletedCount,
        blockedCount,
        forbiddenCount,
      });
    }

    const categoryIds = normalizeCategoryIdList(parsed.data.categoryIds);
    const categories = await getExistingMediaCategoriesByIds(categoryIds);
    if (categories.length !== categoryIds.length) {
      return NextResponse.json({ error: "One or more categories no longer exist." }, { status: 404 });
    }

    await updateMediaAssetCategoriesBulk({
      mediaAssetIds,
      categoryIds,
      mode:
        parsed.data.action === "replaceCategories"
          ? "replace"
          : parsed.data.action === "clearCategories"
            ? "clear"
            : "assign",
    });

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action:
        parsed.data.action === "clearCategories"
          ? AUDIT_ACTIONS.MEDIA_CATEGORIES_CLEARED
          : AUDIT_ACTIONS.MEDIA_CATEGORIES_ASSIGNED,
      targetType: "MediaAsset",
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        action: parsed.data.action,
        mediaAssetIds,
        categoryIds,
      },
    });

    return NextResponse.json({
      ok: true,
      updatedCount: mediaAssetIds.length,
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
        error: error instanceof Error ? error.message : "Could not finish the bulk action.",
      },
      { status: 400 },
    );
  }
}
