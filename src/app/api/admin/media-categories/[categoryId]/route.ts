import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { isFallbackMediaCategorySlug, slugifyMediaCategoryName } from "@/lib/media-categories";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { mediaCategoryEditorSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    categoryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request, { requireAdmin: true });
    const requestMetadata = getRequestMetadataFromRequest(request);

    await enforceRateLimit(RATE_LIMITS.api.settings, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-categories",
      method: requestMetadata.method,
      attemptedAction: "update_media_category",
    });

    const { categoryId } = await context.params;
    const parsed = mediaCategoryEditorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Fix the highlighted category fields.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const existing = await prisma.mediaCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing) {
      return NextResponse.json({ error: "That category no longer exists." }, { status: 404 });
    }

    const slug = slugifyMediaCategoryName(parsed.data.name);
    if (!slug) {
      return NextResponse.json(
        {
          error: "Choose a category name with letters or numbers.",
          fieldErrors: {
            name: ["Choose a category name with letters or numbers."],
          },
        },
        { status: 400 },
      );
    }

    const slugConflict = await prisma.mediaCategory.findFirst({
      where: {
        slug,
        NOT: {
          id: categoryId,
        },
      },
      select: {
        id: true,
      },
    });

    if (slugConflict) {
      return NextResponse.json(
        {
          error: "A category with that name already exists.",
          fieldErrors: {
            name: ["A category with that name already exists."],
          },
        },
        { status: 409 },
      );
    }

    if (isFallbackMediaCategorySlug(existing.slug) && !isFallbackMediaCategorySlug(slug)) {
      return NextResponse.json({ error: "The fallback Unassigned category cannot be renamed." }, { status: 400 });
    }

    const category = await prisma.mediaCategory.update({
      where: {
        id: categoryId,
      },
      data: {
        name: parsed.data.name.trim(),
        slug,
        color: parsed.data.color,
        icon: parsed.data.icon,
      },
    });

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.MEDIA_CATEGORY_UPDATED,
      targetType: "MediaCategory",
      targetId: category.id,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        previousName: existing.name,
        nextName: category.name,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: buildRateLimitHeaders(error) });
    }

    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update category.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request, { requireAdmin: true });
    const requestMetadata = getRequestMetadataFromRequest(request);

    await enforceRateLimit(RATE_LIMITS.api.settings, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/media-categories",
      method: requestMetadata.method,
      attemptedAction: "delete_media_category",
    });

    const { categoryId } = await context.params;
    const existing = await prisma.mediaCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "That category no longer exists." }, { status: 404 });
    }

    if (isFallbackMediaCategorySlug(existing.slug)) {
      return NextResponse.json({ error: "The fallback Unassigned category cannot be deleted." }, { status: 400 });
    }

    await prisma.mediaCategory.delete({
      where: {
        id: categoryId,
      },
    });

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.MEDIA_CATEGORY_DELETED,
      targetType: "MediaCategory",
      targetId: existing.id,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        name: existing.name,
        slug: existing.slug,
      },
    });

    return NextResponse.json({ ok: true, categoryId });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: buildRateLimitHeaders(error) });
    }

    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not delete category.",
      },
      { status: 400 },
    );
  }
}
