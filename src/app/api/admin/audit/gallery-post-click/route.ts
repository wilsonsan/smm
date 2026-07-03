import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadataFromRequest } from "@/lib/http";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const adminUser = await requireAuthenticatedUser();
    const requestMetadata = getRequestMetadataFromRequest(request);
    await enforceRateLimit(RATE_LIMITS.api.galleryBrowsing, {
      actorAdminUserId: adminUser.id,
      userId: adminUser.id,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/audit/gallery-post-click",
      method: requestMetadata.method,
      attemptedAction: "gallery_post_click",
    });
    const body = (await request.json().catch(() => null)) as
      | {
          mediaAssetId?: string;
        }
      | null;
    const mediaAssetId = String(body?.mediaAssetId || "").trim();

    if (!mediaAssetId) {
      return NextResponse.json({ error: "Invalid media asset." }, { status: 400 });
    }

    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.GALLERY_POST_BUTTON_CLICKED,
      targetType: "MediaAsset",
      targetId: mediaAssetId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        mediaAssetId,
      },
    });

    return NextResponse.json({ ok: true });
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

    throw error;
  }
}
