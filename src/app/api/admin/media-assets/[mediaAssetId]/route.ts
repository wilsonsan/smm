import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { canAccessOwnedResource, requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { deleteStoredMediaAsset } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{
    mediaAssetId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  let actorAdminUserId: string | null = null;

  try {
    assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request);
    actorAdminUserId = session.adminUserId;
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
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: request.headers.get("user-agent"),
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
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      ok: true,
      mediaAssetId: result.mediaAssetId,
    });
  } catch (error) {
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
