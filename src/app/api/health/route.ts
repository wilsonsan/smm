import { NextResponse } from "next/server";
import { getApplicationHealthSnapshot } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getApplicationHealthSnapshot({
    includeWorker: true,
  });

  return NextResponse.json(snapshot, {
    status: snapshot.overallStatus === "critical" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
