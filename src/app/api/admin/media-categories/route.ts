import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { slugifyMediaCategoryName } from "@/lib/media-categories";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { mediaCategoryEditorSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await assertSameOrigin(request);
    await requireAdminSessionFromRequest(request);
    const categories = await prisma.mediaCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ categories });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }

    return NextResponse.json({ error: "Could not load categories." }, { status: 400 });
  }
}

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
      endpoint: requestMetadata.endpoint || "/api/admin/media-categories",
      method: requestMetadata.method,
      attemptedAction: "create_media_category",
    });

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

    const existing = await prisma.mediaCategory.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
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

    const highestSortOrder = await prisma.mediaCategory.aggregate({
      _max: {
        sortOrder: true,
      },
    });

    const category = await prisma.mediaCategory.create({
      data: {
        name: parsed.data.name.trim(),
        slug,
        color: parsed.data.color,
        icon: parsed.data.icon,
        sortOrder: (highestSortOrder._max.sortOrder ?? 0) + 10,
      },
    });

    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.MEDIA_CATEGORY_CREATED,
      targetType: "MediaCategory",
      targetId: category.id,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        name: category.name,
        slug: category.slug,
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
        error: error instanceof Error ? error.message : "Could not create category.",
      },
      { status: 400 },
    );
  }
}
