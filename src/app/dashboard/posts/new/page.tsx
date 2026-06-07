import { DateTime } from "luxon";
import { PostEditorForm } from "@/components/post-editor-form";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getInstagramFoundationState } from "@/lib/instagram";
import { toMediaAssetSummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";
import { getDefaultScheduleFields, getResolvedAppTimezone } from "@/lib/time";

type NewPostPageProps = {
  searchParams?: Promise<{
    date?: string;
    time?: string;
    hour?: string;
    minute?: string;
    ampm?: string;
    createdFrom?: string;
    mediaId?: string;
  }>;
};

export default async function NewPostPage({ searchParams }: NewPostPageProps) {
  const adminUser = await requireAuthenticatedUser();
  const resolvedSearchParams = await searchParams;
  const [recentMediaAssets, timezone, instagramFoundation] = await Promise.all([
    prisma.mediaAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        variants: true,
      },
    }),
    getResolvedAppTimezone(),
    getInstagramFoundationState({ refreshHealth: true }),
  ]);
  const requestedDate = resolvedSearchParams?.date?.trim() ?? "";
  const requestedTime = resolvedSearchParams?.time?.trim() ?? "";
  const requestedHour = resolvedSearchParams?.hour?.trim() ?? "";
  const requestedMinute = resolvedSearchParams?.minute?.trim() ?? "";
  const requestedMeridiem = resolvedSearchParams?.ampm?.trim().toUpperCase() ?? "";
  const requestedMediaId = resolvedSearchParams?.mediaId?.trim() ?? "";
  const defaults = getDefaultScheduleFields(timezone, {
    date: DateTime.fromFormat(requestedDate, "yyyy-MM-dd", { zone: timezone }).isValid ? requestedDate : "",
    time: /^([01]\d|2[0-3]):([0-5]\d)$/.test(requestedTime) ? requestedTime : "",
  });
  const resolvedHour = requestedHour && Number.parseInt(requestedHour, 10) >= 1 && Number.parseInt(requestedHour, 10) <= 12 ? requestedHour : defaults.hour;
  const resolvedMinute = /^(00|15|30|45)$/.test(requestedMinute) ? requestedMinute : defaults.minute;
  const resolvedMeridiem = requestedMeridiem === "AM" || requestedMeridiem === "PM" ? requestedMeridiem : defaults.meridiem;
  const preselectedMediaAsset = requestedMediaId
    ? recentMediaAssets.find((asset) => asset.id === requestedMediaId) ?? null
    : null;
  const preselectedMediaMessage = requestedMediaId && !preselectedMediaAsset
    ? "That gallery image could not be found. You can choose another image below."
    : null;

  if (requestedMediaId) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.NEW_POST_OPENED_WITH_PRESELECTED_MEDIA,
      targetType: "MediaAsset",
      targetId: requestedMediaId,
      metadata: {
        mediaAssetId: requestedMediaId,
        resolved: Boolean(preselectedMediaAsset),
      },
    });
  }

  return (
    <section>
      {preselectedMediaMessage ? (
        <section className="composer-feedback-card is-error">
          {preselectedMediaMessage}
        </section>
      ) : null}

      <PostEditorForm
        post={{
          id: "",
          caption: "",
          scheduledDate: defaults.date,
          scheduledHour: resolvedHour,
          scheduledMinute: resolvedMinute,
          scheduledMeridiem: resolvedMeridiem,
          status: "DRAFT",
          mediaAssets: preselectedMediaAsset ? [toMediaAssetSummary(preselectedMediaAsset)] : [],
          platforms: ["FACEBOOK"],
          createdFrom: resolvedSearchParams?.createdFrom === "calendar-date" ? "calendar-date" : "",
        }}
        recentMediaAssets={recentMediaAssets.map((asset) => toMediaAssetSummary(asset))}
        timezone={timezone}
        instagramFoundation={instagramFoundation}
      />
    </section>
  );
}
