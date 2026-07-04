import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { deleteStoredMediaAsset } from "@/lib/uploads";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request, { requireAdmin: true });
    const requestMetadata = getRequestMetadataFromRequest(request);

    await enforceRateLimit(RATE_LIMITS.api.galleryBrowsing, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-assets/delete-unused",
      method: requestMetadata.method,
      attemptedAction: "delete_unused_media",
    });

    const unusedAssets = await prisma.mediaAsset.findMany({
      where: {
        posts: {
          none: {},
        },
        attachedToPosts: {
          none: {},
        },
      },
      select: {
        id: true,
      },
    });

    let deletedCount = 0;
    let blockedCount = 0;

    for (const mediaAsset of unusedAssets) {
      const result = await deleteStoredMediaAsset({ mediaAssetId: mediaAsset.id });
      if (result.status === "blocked") {
        blockedCount += 1;
        continue;
      }

      deletedCount += 1;
    }

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.MEDIA_UNUSED_DELETED,
      targetType: "MediaAsset",
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        requestedCount: unusedAssets.length,
        deletedCount,
        blockedCount,
      },
    });

    return NextResponse.json({
      ok: true,
      deletedCount,
      blockedCount,
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
        error: error instanceof Error ? error.message : "Could not delete unused media.",
      },
      { status: 400 },
    );
  }
}
