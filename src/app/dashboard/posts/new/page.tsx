import { DateTime } from "luxon";
import { PostEditorForm } from "@/components/post-editor-form";
import { toMediaAssetSummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";
import { getDefaultScheduleFields, getResolvedAppTimezone } from "@/lib/time";

type NewPostPageProps = {
  searchParams?: Promise<{
    date?: string;
    time?: string;
  }>;
};

export default async function NewPostPage({ searchParams }: NewPostPageProps) {
  const resolvedSearchParams = await searchParams;
  const [recentMediaAssets, timezone] = await Promise.all([
    prisma.mediaAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      include: {
        variants: true,
      },
    }),
    getResolvedAppTimezone(),
  ]);
  const requestedDate = resolvedSearchParams?.date?.trim() ?? "";
  const requestedTime = resolvedSearchParams?.time?.trim() ?? "";
  const defaults = getDefaultScheduleFields(timezone, {
    date: DateTime.fromFormat(requestedDate, "yyyy-MM-dd", { zone: timezone }).isValid ? requestedDate : "",
    time: /^([01]\d|2[0-3]):([0-5]\d)$/.test(requestedTime) ? requestedTime : "",
  });

  return (
    <section>
      <PostEditorForm
        post={{
          id: "",
          caption: "",
          scheduledDate: defaults.date,
          scheduledHour: defaults.hour,
          scheduledMinute: defaults.minute,
          scheduledMeridiem: defaults.meridiem,
          status: "DRAFT",
          mediaAsset: null,
        }}
        recentMediaAssets={recentMediaAssets.map((asset) => toMediaAssetSummary(asset))}
        timezone={timezone}
      />
    </section>
  );
}
