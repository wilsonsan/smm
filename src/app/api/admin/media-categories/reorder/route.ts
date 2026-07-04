import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { mediaCategoryReorderSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request, { requireAdmin: true });
    const requestMetadata = getRequestMetadataFromRequest(request);

    await enforceRateLimit(RATE_LIMITS.api.settings, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-categories/reorder",
      method: requestMetadata.method,
      attemptedAction: "reorder_media_categories",
    });

    const parsed = mediaCategoryReorderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Fix the category order and try again.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const existingCategories = await prisma.mediaCategory.findMany({
      where: {
        id: {
          in: parsed.data.orderedCategoryIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingCategories.length !== parsed.data.orderedCategoryIds.length) {
      return NextResponse.json({ error: "One or more categories no longer exist." }, { status: 404 });
    }

    await prisma.$transaction(
      parsed.data.orderedCategoryIds.map((categoryId, index) =>
        prisma.mediaCategory.update({
          where: {
            id: categoryId,
          },
          data: {
            sortOrder: (index + 1) * 10,
          },
        }),
      ),
    );

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.MEDIA_CATEGORY_REORDERED,
      targetType: "MediaCategory",
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        orderedCategoryIds: parsed.data.orderedCategoryIds,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: buildRateLimitHeaders(error) });
    }

    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not reorder categories.",
      },
      { status: 400 },
    );
  }
}
