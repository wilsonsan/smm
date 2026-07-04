import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import {
  acquireRateLimitLease,
  buildRateLimitHeaders,
  enforceRateLimit,
  isRateLimitExceededError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeUploadFilename(value: string | null) {
  if (!value) {
    return "upload";
  }

  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded || "upload";
  } catch {
    return value.trim() || "upload";
  }
}

async function buildUploadedFileFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.startsWith("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Response("Select a file to upload.", { status: 400 });
    }

    return file;
  }

  const fileName = decodeUploadFilename(request.headers.get("x-upload-filename"));
  const mimeType = request.headers.get("x-upload-mime-type") || contentType || "application/octet-stream";
  const arrayBuffer = await request.arrayBuffer();

  if (arrayBuffer.byteLength === 0) {
    throw new Response("Select a file to upload.", { status: 400 });
  }

  return new File([arrayBuffer], fileName, { type: mimeType });
}

export async function POST(request: Request) {
  let actorAdminUserId: string | null = null;
  let uploadLease: Awaited<ReturnType<typeof acquireRateLimitLease>> | null = null;

  try {
    const [
      { createAuditLog, AUDIT_ACTIONS },
      { requireAdminSessionFromRequest },
      { assertSameOrigin },
      { storeUploadedMedia },
      { getMediaVariantUrl },
    ] = await Promise.all([
      import("@/lib/audit"),
      import("@/lib/auth/session"),
      import("@/lib/http"),
      import("@/lib/uploads"),
      import("@/lib/media-presentation"),
    ]);

    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request);
    actorAdminUserId = session.adminUserId;
    const requestMetadata = (await import("@/lib/http")).getRequestMetadataFromRequest(request);

    await enforceRateLimit(RATE_LIMITS.uploads.imageUpload, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/uploads",
      method: requestMetadata.method,
      attemptedAction: "media_upload",
    });

    uploadLease = await acquireRateLimitLease(RATE_LIMITS.uploads.uploadConcurrency, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/uploads",
      method: requestMetadata.method,
      attemptedAction: "media_upload_concurrent",
    });

    const file = await buildUploadedFileFromRequest(request);

    const result = await storeUploadedMedia({
      file,
      adminUserId: session.adminUserId,
    });

    const { mediaAsset, variants } = result;

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action:
        result.status === "duplicate"
          ? AUDIT_ACTIONS.MEDIA_UPLOAD_DUPLICATE_SKIPPED
          : AUDIT_ACTIONS.MEDIA_UPLOADED,
      targetType: "MediaAsset",
      targetId: mediaAsset.id,
      metadata: {
        uploadStatus: result.status,
        mimeType: mediaAsset.mimeType,
        sizeBytes: mediaAsset.sizeBytes.toString(),
        storagePath: mediaAsset.storagePath,
      },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      status: result.status,
      mediaAsset: {
        id: mediaAsset.id,
        originalFilename: mediaAsset.originalFilename,
        mimeType: mediaAsset.mimeType,
        width: mediaAsset.width,
        height: mediaAsset.height,
        sizeBytes: mediaAsset.sizeBytes.toString(),
        createdAt: mediaAsset.createdAt.toISOString(),
        categories: [],
        postedPlatforms: {
          postedToFacebook: false,
          postedToInstagram: false,
          postedToGoogle: false,
          postedAnywhere: false,
          postedEverywhere: false,
          publishedAnywhere: false,
        },
        usage: {
          totalUses: 0,
          facebookUses: 0,
          instagramUses: 0,
          googleUses: 0,
          lastUsedAt: null,
        },
        variants: variants.map((variant) => ({
          id: variant.id,
          variantType: variant.variantType,
          mimeType: variant.mimeType,
          width: variant.width,
          height: variant.height,
          sizeBytes: variant.sizeBytes.toString(),
          url: getMediaVariantUrl(variant.id),
        })),
      },
    });
  } catch (error) {
    console.error("Media upload failed.", error);

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

    if (actorAdminUserId) {
      const audit = await import("@/lib/audit").catch(() => null);
      if (audit) {
        await audit
          .createAuditLog({
            actorAdminUserId,
            action: audit.AUDIT_ACTIONS.MEDIA_UPLOAD_FAILED,
            targetType: "MediaAsset",
            metadata: {
              message: error instanceof Error ? error.message : "Upload failed.",
            },
            ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
            userAgent: request.headers.get("user-agent"),
          })
          .catch(() => undefined);
      }
    }

    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await uploadLease?.release().catch(() => undefined);
  }
}
