import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { canAccessOwnedResource, requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { toMediaAssetSummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { revertEditedMediaAssetToOriginal, saveEditedMediaAsset } from "@/lib/uploads";
import { mediaAssetEditSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    mediaAssetId: string;
  }>;
};

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
      endpoint: requestMetadata.endpoint || "/api/admin/media-assets/edit",
      method: requestMetadata.method,
      attemptedAction: "gallery_media_edit",
    });

    const { mediaAssetId } = await context.params;
    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      select: {
        id: true,
        originalFilename: true,
        createdByAdminUserId: true,
        isEdited: true,
      },
    });

    if (!mediaAsset) {
      return NextResponse.json({ error: "This media asset no longer exists." }, { status: 404 });
    }

    if (!canAccessOwnedResource(session.adminUser, mediaAsset.createdByAdminUserId)) {
      return NextResponse.json({ error: "You do not have permission to edit this media asset." }, { status: 403 });
    }

    const rawPayload = await request.json();
    const normalizedPayload =
      rawPayload && typeof rawPayload === "object" && rawPayload !== null && (rawPayload as { mode?: unknown }).mode === "save"
        ? {
            ...(rawPayload as Record<string, unknown>),
            crop:
              rawPayload &&
              typeof (rawPayload as { crop?: unknown }).crop === "object" &&
              (rawPayload as { crop?: unknown }).crop !== null
                ? {
                    ...(rawPayload as { crop: Record<string, unknown> }).crop,
                    x: Math.max(0, Number((rawPayload as { crop: { x?: unknown } }).crop.x ?? 0)),
                    y: Math.max(0, Number((rawPayload as { crop: { y?: unknown } }).crop.y ?? 0)),
                    width: Math.max(1, Number((rawPayload as { crop: { width?: unknown } }).crop.width ?? 1)),
                    height: Math.max(1, Number((rawPayload as { crop: { height?: unknown } }).crop.height ?? 1)),
                  }
                : rawPayload,
          }
        : rawPayload;

    const parsed = mediaAssetEditSchema.safeParse(normalizedPayload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Fix the editor settings and try again.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const updatedMediaAsset =
      parsed.data.mode === "revert"
        ? await revertEditedMediaAssetToOriginal({ mediaAssetId })
        : await saveEditedMediaAsset({
            mediaAssetId,
            crop: parsed.data.crop,
            zoom: parsed.data.zoom,
            rotation: parsed.data.rotation,
            flipHorizontal: parsed.data.flipHorizontal,
            flipVertical: parsed.data.flipVertical,
            aspectRatio: parsed.data.aspectRatio,
            annotations: parsed.data.annotations,
          });

    await createAuditLog({
      actorAdminUserId,
      action:
        parsed.data.mode === "revert"
          ? AUDIT_ACTIONS.MEDIA_REVERTED_TO_ORIGINAL
          : AUDIT_ACTIONS.MEDIA_EDITED,
      targetType: "MediaAsset",
      targetId: updatedMediaAsset.id,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata:
        parsed.data.mode === "revert"
          ? {
              previousEditedState: mediaAsset.isEdited,
            }
          : {
              crop: parsed.data.crop,
              zoom: parsed.data.zoom,
              rotation: parsed.data.rotation,
              flipHorizontal: parsed.data.flipHorizontal,
              flipVertical: parsed.data.flipVertical,
              aspectRatio: parsed.data.aspectRatio,
              annotationsAttempted: Boolean(parsed.data.annotations),
            },
    });

    return NextResponse.json({
      ok: true,
      mediaAsset: toMediaAssetSummary(updatedMediaAsset),
      message:
        parsed.data.mode === "revert"
          ? "Reverted to the original image."
          : "Saved photo changes.",
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
        error: error instanceof Error ? error.message : "Could not save the photo changes.",
      },
      { status: 400 },
    );
  }
}
