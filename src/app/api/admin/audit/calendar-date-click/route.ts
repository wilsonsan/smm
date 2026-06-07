import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";

export async function POST(request: Request) {
  const adminUser = await requireAuthenticatedUser();
  const body = (await request.json().catch(() => null)) as
    | {
        dateKey?: string;
      }
    | null;
  const dateKey = String(body?.dateKey || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.CALENDAR_DATE_CLICKED_TO_CREATE_POST,
    targetType: "CalendarDate",
    targetId: dateKey,
    ipAddress,
    userAgent,
    metadata: {
      dateKey,
    },
  });

  return NextResponse.json({ ok: true });
}
