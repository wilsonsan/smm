import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";

export async function POST(request: Request) {
  const adminUser = await requireAuthenticatedUser();
  const body = (await request.json().catch(() => null)) as
    | {
        mediaAssetId?: string;
      }
    | null;
  const mediaAssetId = String(body?.mediaAssetId || "").trim();

  if (!mediaAssetId) {
    return NextResponse.json({ error: "Invalid media asset." }, { status: 400 });
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.GALLERY_POST_BUTTON_CLICKED,
    targetType: "MediaAsset",
    targetId: mediaAssetId,
    ipAddress,
    userAgent,
    metadata: {
      mediaAssetId,
    },
  });

  return NextResponse.json({ ok: true });
}
