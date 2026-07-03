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
    await enforceRateLimit(RATE_LIMITS.api.dashboard, {
      actorAdminUserId: adminUser.id,
      userId: adminUser.id,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/admin/audit/calendar-date-click",
      method: requestMetadata.method,
      attemptedAction: "calendar_date_click",
    });
    const body = (await request.json().catch(() => null)) as
      | {
          dateKey?: string;
        }
      | null;
    const dateKey = String(body?.dateKey || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }

    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.CALENDAR_DATE_CLICKED_TO_CREATE_POST,
      targetType: "CalendarDate",
      targetId: dateKey,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      metadata: {
        dateKey,
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
