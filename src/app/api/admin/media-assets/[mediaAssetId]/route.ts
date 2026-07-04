import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { canAccessOwnedResource, requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { deleteStoredMediaAsset } from "@/lib/uploads";
import { mediaAssetRenameSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    mediaAssetId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  let actorAdminUserId: string | null = null;

  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request);
    actorAdminUserId = session.adminUserId;
    const requestMetadata = getRequestMetadataFromRequest(request);
    await enforceRateLimit(RATE_LIMITS.api.galleryBrowsing, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-assets",
      method: requestMetadata.method,
      attemptedAction: "gallery_media_delete",
    });
    const { mediaAssetId } = await context.params;
    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      select: {
        createdByAdminUserId: true,
      },
    });

    if (!mediaAsset) {
      return NextResponse.json({ error: "This media asset no longer exists." }, { status: 404 });
    }

    if (!canAccessOwnedResource(session.adminUser, mediaAsset.createdByAdminUserId)) {
      return NextResponse.json({ error: "You do not have permission to delete this media asset." }, { status: 403 });
    }

    const result = await deleteStoredMediaAsset({ mediaAssetId });

    if (result.status === "blocked") {
      await createAuditLog({
        actorAdminUserId,
        action: AUDIT_ACTIONS.MEDIA_DELETE_BLOCKED,
        targetType: "MediaAsset",
        targetId: result.mediaAssetId,
        metadata: {
          blockingPostIds: result.blockingPostIds,
        },
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
      });

      return NextResponse.json(
        {
          error: "This media is still attached to one or more non-published posts. Remove it from those posts before deleting it.",
        },
        { status: 409 },
      );
    }

    await createAuditLog({
      actorAdminUserId,
      action: AUDIT_ACTIONS.MEDIA_DELETED,
      targetType: "MediaAsset",
      targetId: result.mediaAssetId,
      metadata: {
        deletedFileCount: result.deletedFileCount,
        missingFileCount: result.missingFileCount,
      },
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
    });

    return NextResponse.json({
      ok: true,
      mediaAssetId: result.mediaAssetId,
    });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 429,
          headers: buildRateLimitHeaders(error),
        },
      );
    }

    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not delete this media asset.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let actorAdminUserId: string | null = null;

  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request);
    actorAdminUserId = session.adminUserId;
    const requestMetadata = getRequestMetadataFromRequest(request);
    await enforceRateLimit(RATE_LIMITS.api.galleryBrowsing, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-assets",
      method: requestMetadata.method,
      attemptedAction: "gallery_media_rename",
    });
    const { mediaAssetId } = await context.params;
    const parsed = mediaAssetRenameSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Fix the filename and try again.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      select: {
        id: true,
        originalFilename: true,
        createdByAdminUserId: true,
      },
    });

    if (!mediaAsset) {
      return NextResponse.json({ error: "This media asset no longer exists." }, { status: 404 });
    }

    if (!canAccessOwnedResource(session.adminUser, mediaAsset.createdByAdminUserId)) {
      return NextResponse.json({ error: "You do not have permission to rename this media asset." }, { status: 403 });
    }

    const updated = await prisma.mediaAsset.update({
      where: {
        id: mediaAssetId,
      },
      data: {
        originalFilename: parsed.data.originalFilename,
      },
      select: {
        id: true,
        originalFilename: true,
      },
    });

    await createAuditLog({
      actorAdminUserId,
      action: AUDIT_ACTIONS.MEDIA_RENAMED,
      targetType: "MediaAsset",
      targetId: updated.id,
      metadata: {
        previousFilename: mediaAsset.originalFilename,
        nextFilename: updated.originalFilename,
      },
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
    });

    return NextResponse.json({
      ok: true,
      mediaAssetId: updated.id,
      originalFilename: updated.originalFilename,
    });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 429,
          headers: buildRateLimitHeaders(error),
        },
      );
    }

    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not rename this media asset.",
      },
      { status: 400 },
    );
  }
}
