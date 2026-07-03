import { NextResponse } from "next/server";
import { getApplicationHealthSnapshot } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getApplicationHealthSnapshot({
    includeWorker: false,
  });

  return NextResponse.json(snapshot, {
    status: snapshot.database.status === "critical" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
