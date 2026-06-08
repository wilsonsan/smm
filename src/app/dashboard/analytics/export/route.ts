import { NextRequest } from "next/server";
import {
  getFailureAnalytics,
  getPublishHistory,
  getUserAnalyticsRows,
  parseAnalyticsFilters,
  recordAnalyticsAuditEvent,
} from "@/lib/analytics";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { getResolvedAppTimezone } from "@/lib/time";

function escapeCsvValue(value: string | number | null | undefined) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }

  return normalized;
}

function buildCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\r\n");
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSessionFromRequest(request, {
    requireAdmin: true,
  });
  const kind = request.nextUrl.searchParams.get("kind") || "";
  const timezone = await getResolvedAppTimezone();
  const filters = parseAnalyticsFilters(request.nextUrl.searchParams);

  if (kind === "history") {
    const rows = await getPublishHistory(filters, timezone, 5000);
    await recordAnalyticsAuditEvent({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.HISTORY_EXPORTED,
      targetType: "PublishHistoryExport",
      metadata: {
        kind,
        filters,
      },
    }).catch(() => undefined);

    const csv = buildCsv([
      ["Date", "Platforms", "Creator", "Status", "Description Preview", "Published Links"],
      ...rows.map((row) => [
        row.date?.toISOString() || "",
        row.platforms.map((platform) => `${platform.platform}:${platform.status}`).join(" | "),
        row.creatorName,
        row.statusLabel,
        row.descriptionPreview,
        row.publishedLinks.map((link) => `${link.platform}:${link.url}`).join(" | "),
      ]),
    ]);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="publish-history.csv"',
      },
    });
  }

  if (kind === "users") {
    const rows = await getUserAnalyticsRows();
    await recordAnalyticsAuditEvent({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.REPORT_GENERATED,
      targetType: "UserAnalyticsExport",
      metadata: {
        kind,
      },
    }).catch(() => undefined);

    const csv = buildCsv([
      ["User", "Username", "Role", "Published Posts", "Scheduled Posts", "Failed Posts", "Drafts"],
      ...rows.map((row) => [
        row.displayName,
        row.username,
        row.role,
        row.publishedPosts,
        row.scheduledPosts,
        row.failedPosts,
        row.draftPosts,
      ]),
    ]);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="user-analytics.csv"',
      },
    });
  }

  if (kind === "failures") {
    const failures = await getFailureAnalytics(250);
    await recordAnalyticsAuditEvent({
      actorAdminUserId: session.adminUserId,
      action: AUDIT_ACTIONS.REPORT_GENERATED,
      targetType: "FailureLogExport",
      metadata: {
        kind,
      },
    }).catch(() => undefined);

    const csv = buildCsv([
      ["Attempted At", "Platform", "Creator", "Description Preview", "Error Summary", "Duration", "Retry Count"],
      ...failures.recentFailures.map((row) => [
        row.startedAt.toISOString(),
        row.platform,
        row.creatorName,
        row.descriptionPreview,
        row.errorSummary,
        row.durationMs ?? "",
        row.retryCount,
      ]),
    ]);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="failure-logs.csv"',
      },
    });
  }

  return new Response("Unknown export.", {
    status: 400,
  });
}
