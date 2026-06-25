"use client";

/* eslint-disable @next/next/no-img-element */
import { SocialPlatform } from "@prisma/client";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  type SVGProps,
} from "react";
import { savePostAction } from "@/app/dashboard/posts/actions";
import {
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  ComposeIcon,
  FacebookIcon,
  GalleryIcon,
  SuccessIcon,
} from "@/components/dashboard-icons";
import { MediaUploadField } from "@/components/media-upload-field";
import { SubmitButton } from "@/components/submit-button";
import {
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  type MediaAssetGallerySummary,
  type MediaAssetSummary,
} from "@/lib/media-presentation";
import { resolveRenderedPlatformContent } from "@/lib/posts";
import {
  getCaptionMaxForPlatforms,
  getMaxMediaCountForPlatforms,
  getPlatformMediaLimitMessage,
} from "@/lib/platform-rules";
import { normalizeHashtagList, type HashtagSettings } from "@/lib/hashtags";
import {
  buildTemplateVariableValueMap,
  renderTemplateVariables,
  type TemplateVariableDefinition,
} from "@/lib/template-variables";
import { getSchedulerTimezoneLabel, SCHEDULER_MINUTE_OPTIONS } from "@/lib/time";
import { initialFormState } from "@/lib/validation";
import type { GoogleFoundationState } from "@/lib/google";
import type { InstagramFoundationState } from "@/lib/instagram";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MERIDIEM_OPTIONS = ["AM", "PM"] as const;
const FACEBOOK_PLATFORM = "FACEBOOK";
const INSTAGRAM_PLATFORM = "INSTAGRAM";
const GOOGLE_PLATFORM = "GOOGLE_BUSINESS";

type PostEditorFormProps = {
  post?: {
    id: string;
    caption?: string;
    descriptionMain?: string;
    descriptionFacebook?: string;
    descriptionInstagram?: string;
    descriptionGoogleBusiness?: string;
    instagramFirstComment?: string;
    hashtags?: string[];
    includeHashtagsInGoogle?: boolean;
    scheduledDate: string;
    scheduledHour: string;
    scheduledMinute: string;
    scheduledMeridiem: string;
    status: string;
    mediaAssets: MediaAssetSummary[];
    platforms: string[];
    platformResults?: Array<{
      platform: string;
      status: string;
      label: "Pending" | "Success" | "Failed";
      tone: "publishing" | "published" | "failed";
    }>;
    createdFrom?: string;
    createdByLabel?: string;
    createdAtLabel?: string;
    updatedByLabel?: string;
    updatedAtLabel?: string;
    instagramFirstCommentStatusLabel?: string;
  };
  recentMediaAssets: MediaAssetGallerySummary[];
  timezone: string;
  templateVariables?: TemplateVariableDefinition[];
  hashtagSettings?: HashtagSettings;
  instagramFoundation?: InstagramFoundationState;
  googleFoundation?: GoogleFoundationState;
  previewProfiles?: {
    facebook?: {
      name: string | null;
      subtitle: string | null;
      profilePictureUrl: string | null;
    };
    instagram?: {
      username: string | null;
      subtitle: string | null;
      profilePictureUrl: string | null;
    };
    google?: {
      name: string | null;
      subtitle: string | null;
      profilePictureUrl: string | null;
    };
  };
  isReadOnly?: boolean;
  hideHeroCopy?: boolean;
};

type PreviewPlatform = "FACEBOOK" | "INSTAGRAM" | "GOOGLE";

function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" />
      <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" />
      <path d="m5 15 .7 1.7L7.5 17l-1.8.8L5 19.5l-.7-1.7L2.5 17l1.8-.8L5 15Z" />
    </svg>
  );
}

function UploadCloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8.5 18.5h8a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7-1.1A4.2 4.2 0 0 0 8.5 18.5Z" />
      <path d="M12 8.5v8" />
      <path d="m9.2 11.3 2.8-2.8 2.8 2.8" />
    </svg>
  );
}

function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
      <path d="M3.5 9.5h17" />
    </svg>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function PaperPlaneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M21 3 10 14" />
      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
    </svg>
  );
}

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5c-.2 1.2-.9 2.3-1.9 3v2.5h3.1c1.8-1.7 2.8-4.2 2.8-7.2Z" fill="#4285F4" />
      <path d="M12 21c2.5 0 4.6-.8 6.2-2.2l-3.1-2.5c-.9.6-1.9 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8H3.6V16c1.6 3 4.7 5 8.4 5Z" fill="#34A853" />
      <path d="M6.9 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.2H3.6A9 9 0 0 0 3 11.6c0 1.6.4 3.1 1.1 4.4l2.8-2.5Z" fill="#FBBC04" />
      <path d="M12 5.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.6 2.8 14.5 2 12 2 8.3 2 5.2 4 3.6 7.2l3.3 2.5c.7-2.2 2.7-3.8 5.1-3.8Z" fill="#EA4335" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="instagramGradient" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEDA75" />
          <stop offset="0.35" stopColor="#FA7E1E" />
          <stop offset="0.65" stopColor="#D62976" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.4" stroke="url(#instagramGradient)" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" stroke="url(#instagramGradient)" strokeWidth="2" />
      <circle cx="17.1" cy="6.9" r="1" fill="url(#instagramGradient)" />
    </svg>
  );
}

function LikeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8.2 10.4v8.1H5.5a1.5 1.5 0 0 1-1.5-1.5v-5.1a1.5 1.5 0 0 1 1.5-1.5h2.7Z" />
      <path d="M8.2 18.5h7a2 2 0 0 0 1.9-1.5l1.1-4.1a1.9 1.9 0 0 0-1.8-2.4h-4.1l.6-2.9a2 2 0 0 0-3.9-.9l-1.5 3.7v8.1Z" />
    </svg>
  );
}

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5.5 17.5 4 21l3.7-1.8h9a3.3 3.3 0 0 0 3.3-3.3V8.6a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 8.6v5.6a3.3 3.3 0 0 0 1.5 2.8Z" />
    </svg>
  );
}

function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M15.5 8.5 20 4v11" />
      <path d="M20 4 9.3 14.7" />
      <path d="M6.5 8.4H4.9A1.9 1.9 0 0 0 3 10.3v8.8A1.9 1.9 0 0 0 4.9 21h8.8a1.9 1.9 0 0 0 1.9-1.9v-1.6" />
    </svg>
  );
}

function BookmarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7 4.8h10a1.7 1.7 0 0 1 1.7 1.7v12.7L12 15.6l-6.7 3.6V6.5A1.7 1.7 0 0 1 7 4.8Z" />
    </svg>
  );
}

function MoreDotsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="6.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="17.5" cy="12" r="1.4" />
    </svg>
  );
}

function TileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3.2" />
      <path d="M12 4v16" />
      <path d="M4 12h16" />
      <path d="m8 8 2 2" />
      <path d="m14 14 2 2" />
    </svg>
  );
}

function PreviewAvatar({
  profilePictureUrl,
  alt,
  className,
  imageClassName,
  fallback,
}: {
  profilePictureUrl: string | null | undefined;
  alt: string;
  className: string;
  imageClassName?: string;
  fallback: ReactNode;
}) {
  return (
    <div className={className}>
      {profilePictureUrl ? (
        <img src={profilePictureUrl} alt={alt} className={imageClassName || "composer-avatar-image"} />
      ) : (
        fallback
      )}
    </div>
  );
}

function formatLocalScheduleLabel(input: {
  scheduledDate: string;
  scheduledHour: string;
  scheduledMinute: string;
  scheduledMeridiem: string;
  timezoneLabel: string;
}) {
  if (!input.scheduledDate) {
    return "Not scheduled yet";
  }

  const [year, month, day] = input.scheduledDate.split("-").map((value) => Number.parseInt(value, 10));
  if (!year || !month || !day) {
    return "Not scheduled yet";
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  return `${formattedDate} at ${input.scheduledHour || "5"}:${input.scheduledMinute || "00"} ${input.scheduledMeridiem || "PM"} ${input.timezoneLabel === "Eastern Time" ? "ET" : input.timezoneLabel}`;
}

function PlatformCard({
  icon,
  label,
  tone,
  selected,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "facebook" | "google" | "instagram";
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const statusLabel = selected ? "Selected" : disabled ? "Locked" : "Available";
  return (
    <button
      type="button"
      className={`composer-platform-card is-${tone}${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`.trim()}
      onClick={disabled && !selected ? undefined : onClick}
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled && !selected}
    >
      <span className={`composer-platform-icon is-${tone}`.trim()}>{icon}</span>
      <span className="composer-platform-copy">
        <strong>{label}</strong>
      </span>
      <span className={`composer-platform-indicator${selected ? " is-selected" : disabled ? " is-locked" : " is-available"}`.trim()}>
        {statusLabel}
      </span>
    </button>
  );
}

function formatCharacterCount(value: number) {
  return value.toLocaleString();
}

function formatHashtagChipLabel(value: string) {
  return value.startsWith("#") ? value : `#${value}`;
}

function parseHashtagInput(value: string) {
  return normalizeHashtagList(value.split(/[\s,]+/).map((entry) => entry.trim()));
}

export function PostEditorForm({
  post,
  recentMediaAssets,
  timezone,
  templateVariables = [],
  hashtagSettings,
  instagramFoundation,
  googleFoundation,
  previewProfiles,
  isReadOnly = false,
  hideHeroCopy = false,
}: PostEditorFormProps) {
  const [state, formAction] = useActionState(savePostAction, initialFormState);
  const formRef = useRef<HTMLFormElement | null>(null);
  const instagramFirstCommentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hashtagInputRef = useRef<HTMLInputElement | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>("FACEBOOK");
  const timezoneLabel = getSchedulerTimezoneLabel(timezone);
  const templateVariableOptions = useMemo(
    () => templateVariables.filter((variable) => variable.format.trim()),
    [templateVariables],
  );
  const templateVariableValueMap = useMemo(
    () => buildTemplateVariableValueMap(templateVariables),
    [templateVariables],
  );

  const fallbackValues = useMemo(
    () => ({
      descriptionMain: post?.descriptionMain ?? post?.caption ?? "",
      descriptionFacebook: post?.descriptionFacebook ?? "",
      descriptionInstagram: post?.descriptionInstagram ?? "",
      descriptionGoogleBusiness: post?.descriptionGoogleBusiness ?? "",
      instagramFirstComment: post?.instagramFirstComment ?? "",
      hashtags: post?.hashtags ?? [],
      includeHashtagsInGoogle: post?.includeHashtagsInGoogle ?? false,
      appliedHashtagGroups: [] as string[],
      scheduledDate: post?.scheduledDate ?? "",
      scheduledHour: post?.scheduledHour ?? "5",
      scheduledMinute: post?.scheduledMinute ?? "00",
      scheduledMeridiem: post?.scheduledMeridiem ?? "PM",
      mediaAssetIds: post?.mediaAssets.map((asset) => asset.id) ?? [],
      platforms: post?.platforms.length ? post.platforms : [],
      mediaSelectionSource: "",
    }),
    [post],
  );

  const formValues = state.submittedValues ?? fallbackValues;

  const [caption, setCaption] = useState(formValues.descriptionMain);
  const [descriptionFacebook, setDescriptionFacebook] = useState(formValues.descriptionFacebook);
  const [descriptionInstagram, setDescriptionInstagram] = useState(formValues.descriptionInstagram);
  const [descriptionGoogleBusiness, setDescriptionGoogleBusiness] = useState(formValues.descriptionGoogleBusiness);
  const [instagramFirstComment, setInstagramFirstComment] = useState(formValues.instagramFirstComment);
  const [scheduledDate, setScheduledDate] = useState(formValues.scheduledDate);
  const [scheduledHour, setScheduledHour] = useState(formValues.scheduledHour);
  const [scheduledMinute, setScheduledMinute] = useState(formValues.scheduledMinute);
  const [scheduledMeridiem, setScheduledMeridiem] = useState(formValues.scheduledMeridiem);
  const [selectedMediaAssetIds, setSelectedMediaAssetIds] = useState(formValues.mediaAssetIds);
  const [selectedPlatforms, setSelectedPlatforms] = useState(formValues.platforms);
  const [mediaSelectionSource, setMediaSelectionSource] = useState(formValues.mediaSelectionSource ?? "");
  const [hashtags, setHashtags] = useState(formValues.hashtags);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [includeHashtagsInGoogle, setIncludeHashtagsInGoogle] = useState(formValues.includeHashtagsInGoogle);
  const [appliedHashtagGroups, setAppliedHashtagGroups] = useState(formValues.appliedHashtagGroups);
  const [selectedHashtagGroupId, setSelectedHashtagGroupId] = useState("");
  const [showHashtagHelp, setShowHashtagHelp] = useState(false);
  const [showPlatformOverrides, setShowPlatformOverrides] = useState(
    Boolean(
      formValues.descriptionFacebook ||
        formValues.descriptionInstagram ||
        formValues.descriptionGoogleBusiness,
    ),
  );
  const [showInstagramFirstComment, setShowInstagramFirstComment] = useState(
    Boolean(formValues.instagramFirstComment),
  );
  const [selectedVariableToken, setSelectedVariableToken] = useState(
    templateVariableOptions[0]?.format ?? "",
  );

  useEffect(() => {
    setCaption(formValues.descriptionMain);
    setDescriptionFacebook(formValues.descriptionFacebook);
    setDescriptionInstagram(formValues.descriptionInstagram);
    setDescriptionGoogleBusiness(formValues.descriptionGoogleBusiness);
    setInstagramFirstComment(formValues.instagramFirstComment);
    setScheduledDate(formValues.scheduledDate);
    setScheduledHour(formValues.scheduledHour);
    setScheduledMinute(formValues.scheduledMinute);
    setScheduledMeridiem(formValues.scheduledMeridiem);
    setSelectedMediaAssetIds(formValues.mediaAssetIds);
    setSelectedPlatforms(formValues.platforms);
    setMediaSelectionSource(formValues.mediaSelectionSource ?? "");
    setHashtags(formValues.hashtags);
    setIncludeHashtagsInGoogle(formValues.includeHashtagsInGoogle);
    setAppliedHashtagGroups(formValues.appliedHashtagGroups);
    setShowPlatformOverrides(
      Boolean(
        formValues.descriptionFacebook ||
          formValues.descriptionInstagram ||
          formValues.descriptionGoogleBusiness,
      ),
    );
    setShowInstagramFirstComment(Boolean(formValues.instagramFirstComment));
  }, [
    formValues.descriptionMain,
    formValues.descriptionFacebook,
    formValues.descriptionInstagram,
    formValues.descriptionGoogleBusiness,
    formValues.instagramFirstComment,
    formValues.hashtags,
    formValues.includeHashtagsInGoogle,
    formValues.mediaAssetIds,
    formValues.mediaSelectionSource,
    formValues.platforms,
    formValues.appliedHashtagGroups,
    formValues.scheduledDate,
    formValues.scheduledHour,
    formValues.scheduledMeridiem,
    formValues.scheduledMinute,
  ]);

  useEffect(() => {
    const hasFieldErrors = Boolean(state.fieldErrors && Object.keys(state.fieldErrors).length > 0);
    const shouldScrollToTop = Boolean((state.message && !state.success) || hasFieldErrors);

    if (!shouldScrollToTop) {
      return;
    }

    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [state.fieldErrors, state.message, state.success]);

  useEffect(() => {
    if (!templateVariableOptions.length) {
      setSelectedVariableToken("");
      return;
    }

    setSelectedVariableToken((current) =>
      current && templateVariableOptions.some((variable) => variable.format === current)
        ? current
        : templateVariableOptions[0]?.format ?? "",
    );
  }, [templateVariableOptions]);

  const resolvedSelectedMediaAssets = useMemo(
    () =>
      selectedMediaAssetIds
        .map(
          (selectedId) =>
            recentMediaAssets.find((asset) => asset.id === selectedId) ??
            post?.mediaAssets.find((asset) => asset.id === selectedId) ??
            null,
        )
        .filter((asset): asset is MediaAssetSummary => asset !== null),
    [post?.mediaAssets, recentMediaAssets, selectedMediaAssetIds],
  );

  const minuteOptions = SCHEDULER_MINUTE_OPTIONS.includes(
    scheduledMinute as (typeof SCHEDULER_MINUTE_OPTIONS)[number],
  )
    ? [...SCHEDULER_MINUTE_OPTIONS]
    : [scheduledMinute || "00", ...SCHEDULER_MINUTE_OPTIONS];

  const previewMediaAsset = resolvedSelectedMediaAssets[0] ?? null;
  const previewVariant = previewMediaAsset
    ? getPreferredPreviewVariant(previewMediaAsset.variants)
    : null;
  const normalizedHashtags = useMemo(() => normalizeHashtagList(hashtags), [hashtags]);
  const maxMediaCount = getMaxMediaCountForPlatforms(selectedPlatforms);
  const captionMax = getCaptionMaxForPlatforms(selectedPlatforms);
  const captionOverallState = caption.length > captionMax ? "over" : "short";
  const captionProgressPercent = Math.max(0, Math.min(100, Math.round((caption.length / Math.max(captionMax, 1)) * 100)));
  const mediaLimitMessage =
    selectedMediaAssetIds.length > maxMediaCount ? getPlatformMediaLimitMessage(selectedPlatforms) : null;
  const renderedCaptionPreview = renderTemplateVariables(caption, templateVariableValueMap).text.trim();
  const captionPreview = renderedCaptionPreview || "Fresh tile install with clean lines and warm tones...";
  const scheduledForLabel = formatLocalScheduleLabel({
    scheduledDate,
    scheduledHour,
    scheduledMinute,
    scheduledMeridiem,
    timezoneLabel,
  });
  const postTypeLabel = resolvedSelectedMediaAssets.length > 0 ? "Image post" : "Text-only post";
  const mediaCountLabel = `${resolvedSelectedMediaAssets.length} media`;
  const googlePreviewDateLabel = post?.scheduledDate
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${post.scheduledDate}T00:00:00Z`))
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date());
  const instagramPreviewUsername =
    instagramFoundation?.username && instagramFoundation.username !== "dev_override_instagram"
      ? instagramFoundation.username
      : "nctilepros";
  const facebookPreviewName = previewProfiles?.facebook?.name || "NC Tile Pros";
  const facebookPreviewSubtitle = previewProfiles?.facebook?.subtitle || "Just now - Public";
  const instagramPreviewSubtitle =
    previewProfiles?.instagram?.subtitle && previewProfiles.instagram.subtitle !== "Developer Override"
      ? previewProfiles.instagram.subtitle
      : "Raleigh, North Carolina";
  const googlePreviewName = previewProfiles?.google?.name || "NC Tile Pros";
  const googlePreviewSubtitle = previewProfiles?.google?.subtitle || googlePreviewDateLabel;
  const hashtagGroups = hashtagSettings?.groups ?? [];
  const selectedHashtagGroup = hashtagGroups.find((group) => group.id === selectedHashtagGroupId) ?? null;
  const previewDescriptionValues = {
    descriptionMain: caption,
    descriptionFacebook,
    descriptionInstagram,
    descriptionGoogleBusiness,
    instagramFirstComment,
    hashtags: normalizedHashtags,
    includeHashtagsInGoogle,
  };
  const previewHashtagSettings = hashtagSettings ?? { facebookDefaultLimit: 5 };
  const facebookPreviewContent = resolveRenderedPlatformContent(
    previewDescriptionValues,
    SocialPlatform.FACEBOOK,
    templateVariableValueMap,
    previewHashtagSettings,
  );
  const instagramPreviewContent = resolveRenderedPlatformContent(
    previewDescriptionValues,
    SocialPlatform.INSTAGRAM,
    templateVariableValueMap,
    previewHashtagSettings,
  );
  const googlePreviewContent = resolveRenderedPlatformContent(
    previewDescriptionValues,
    SocialPlatform.GOOGLE_BUSINESS,
    templateVariableValueMap,
    previewHashtagSettings,
  );
  const facebookCaptionPreview =
    facebookPreviewContent.descriptionText.trim() || "Fresh tile install with clean lines and warm tones...";
  const instagramCaptionPreview =
    instagramPreviewContent.descriptionText.trim() ||
    "Clean tile lines, sharp details, and a finish that feels built to last.";
  const googleCaptionPreview =
    googlePreviewContent.descriptionText.trim() || "Fresh tile install with clean lines and warm tones...";
  const instagramFirstCommentPreview = instagramPreviewContent.firstCommentText.trim();

  function addHashtagsFromDraft(rawValue: string) {
    const nextHashtags = parseHashtagInput(rawValue);
    if (nextHashtags.length === 0) {
      return;
    }

    setHashtags((current) => normalizeHashtagList([...current, ...nextHashtags]));
    setHashtagDraft("");
  }

  function removeHashtag(tagToRemove: string) {
    setHashtags((current) => current.filter((tag) => tag !== tagToRemove));
  }

  function applySelectedHashtagGroup() {
    if (!selectedHashtagGroupId) {
      return;
    }

    const selectedGroup = hashtagSettings?.groups.find((group) => group.id === selectedHashtagGroupId);
    if (!selectedGroup) {
      return;
    }

    setHashtags((current) => normalizeHashtagList([...current, ...selectedGroup.hashtags]));
    setAppliedHashtagGroups((current) => [...new Set([...current, selectedGroup.name])]);
  }

  function insertVariableToken(
    textarea: HTMLTextAreaElement | null,
    value: string,
    setValue: Dispatch<SetStateAction<string>>,
  ) {
    if (!selectedVariableToken) {
      return;
    }

    if (!textarea) {
      setValue((current) => `${current}${current ? " " : ""}${selectedVariableToken}`);
      return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const nextValue = `${value.slice(0, start)}${selectedVariableToken}${value.slice(end)}`;
    setValue(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = start + selectedVariableToken.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return (
    <form ref={formRef} action={formAction} className="composer-shell">
      <input type="hidden" name="postId" value={post?.id ?? ""} />
      <input type="hidden" name="createdFrom" value={post?.createdFrom ?? ""} />
      <input type="hidden" name="mediaSelectionSource" value={mediaSelectionSource} />
      <input type="hidden" name="descriptionFacebook" value={descriptionFacebook} />
      <input type="hidden" name="descriptionInstagram" value={descriptionInstagram} />
      <input type="hidden" name="descriptionGoogleBusiness" value={descriptionGoogleBusiness} />
      <input type="hidden" name="instagramFirstComment" value={instagramFirstComment} />
      {normalizedHashtags.map((hashtag) => (
        <input key={hashtag} type="hidden" name="hashtags" value={hashtag} />
      ))}
      {appliedHashtagGroups.map((groupName) => (
        <input key={groupName} type="hidden" name="appliedHashtagGroups" value={groupName} />
      ))}
      {includeHashtagsInGoogle ? (
        <input type="hidden" name="includeHashtagsInGoogle" value="on" />
      ) : null}
      {selectedPlatforms.map((platform) => (
        <input key={platform} type="hidden" name="platforms" value={platform} />
      ))}

      <div className="composer-grid">
        <section className="composer-main-column">
          <header className="composer-hero">
            {!hideHeroCopy ? (
              <div className="composer-hero-copy">
                <div className="composer-hero-title-row">
                  <span className="composer-hero-mark" aria-hidden="true">
                    <SparkleIcon />
                  </span>
                  <div>
                    <h1>{post?.id ? "Edit Post" : "New Post"}</h1>
                  </div>
                </div>
              </div>
            ) : null}

            {!isReadOnly ? (
              <div className="composer-hero-actions">
                <SubmitButton className="composer-action-button is-secondary" name="intent" value="draft">
                  Save Draft
                </SubmitButton>
                <SubmitButton className="composer-action-button is-blue" name="intent" value="schedule">
                  <CalendarIcon />
                  <span>Schedule Post</span>
                </SubmitButton>
                <SubmitButton className="composer-action-button is-green" name="intent" value="publish">
                  <PaperPlaneIcon />
                  <span>Post Now</span>
                </SubmitButton>
              </div>
            ) : (
              <div className="composer-readonly-pill">Read only</div>
            )}
          </header>

          {state.message ? (
            <div className={`composer-feedback-card ${state.success ? "is-success" : "is-error"}`.trim()}>
              {state.message}
            </div>
          ) : null}

          <section className="composer-section-card">
            <div className="composer-section-heading">
              <span className="composer-step-badge is-blue">1</span>
              <div>
                <h2>Choose Platforms</h2>
              </div>
            </div>

            <div className="composer-platform-grid">
              <PlatformCard
                icon={<FacebookIcon />}
                label="Facebook"
                tone="facebook"
                selected={selectedPlatforms.includes(FACEBOOK_PLATFORM)}
                onClick={() =>
                  setSelectedPlatforms((current) =>
                    current.includes(FACEBOOK_PLATFORM)
                      ? current.filter((platform) => platform !== FACEBOOK_PLATFORM)
                      : [...current, FACEBOOK_PLATFORM],
                  )
                }
              />
              <PlatformCard
                icon={<GoogleIcon />}
                label="Google"
                tone="google"
                selected={selectedPlatforms.includes(GOOGLE_PLATFORM)}
                disabled={googleFoundation?.status !== "READY"}
                onClick={() =>
                  setSelectedPlatforms((current) =>
                    current.includes(GOOGLE_PLATFORM)
                      ? current.filter((platform) => platform !== GOOGLE_PLATFORM)
                      : [...current, GOOGLE_PLATFORM],
                  )
                }
              />
              <PlatformCard
                icon={<InstagramIcon />}
                label="Instagram"
                tone="instagram"
                selected={selectedPlatforms.includes(INSTAGRAM_PLATFORM)}
                disabled={instagramFoundation?.status !== "READY"}
                onClick={() =>
                  setSelectedPlatforms((current) =>
                    current.includes(INSTAGRAM_PLATFORM)
                      ? current.filter((platform) => platform !== INSTAGRAM_PLATFORM)
                      : [...current, INSTAGRAM_PLATFORM],
                  )
                }
              />
            </div>
            {state.fieldErrors?.platforms?.map((error) => (
              <span key={error} className="error-text">
                {error}
              </span>
            ))}
          </section>

          <section className="composer-section-card">
            <div className="composer-section-heading">
              <span className="composer-step-badge">2</span>
              <div>
                <h2>Caption</h2>
              </div>
            </div>

            <div className="composer-caption-panel">
              <label htmlFor="descriptionMain" className="composer-caption-label">
                Caption
              </label>
              <div className="composer-caption-shell">
                <textarea
                  id="descriptionMain"
                  name="descriptionMain"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Fresh tile install with clean lines and warm tones..."
                  disabled={isReadOnly}
                  maxLength={captionMax}
                  className="composer-caption-textarea"
                />
              </div>
              <div className="composer-caption-meta">
                <span className={`composer-character-count is-${captionOverallState}`.trim()}>
                  {formatCharacterCount(caption.length)} / {formatCharacterCount(captionMax)}
                </span>
                <div
                  className="composer-caption-progress"
                  role="progressbar"
                  aria-label={`Caption length ${caption.length} of ${captionMax}`}
                  aria-valuemin={0}
                  aria-valuemax={captionMax}
                  aria-valuenow={Math.min(caption.length, captionMax)}
                >
                  <span style={{ width: `${captionProgressPercent}%` }} />
                </div>
              </div>
            </div>

            <div className="composer-description-block">
              <div className="composer-description-header">
                <div>
                  <strong>Main Description</strong>
                  <p>This is the default copy used unless a platform override replaces it.</p>
                </div>
                <button
                  type="button"
                  className={`composer-override-toggle${showPlatformOverrides ? " is-active" : ""}`.trim()}
                  onClick={() => setShowPlatformOverrides((current) => !current)}
                >
                  Customize per platform
                </button>
              </div>

              {showPlatformOverrides ? (
                <div className="composer-override-grid">
                  {selectedPlatforms.includes(FACEBOOK_PLATFORM) ? (
                    <div className="composer-override-card">
                      <div className="composer-override-card-head">
                        <div className="composer-override-card-title">
                          <span className="composer-override-card-icon is-facebook">
                            <FacebookIcon />
                          </span>
                          <div>
                            <strong>Facebook Override</strong>
                            <p>Leave blank to use Main Description.</p>
                          </div>
                        </div>
                        <span className="composer-override-pill is-facebook">Facebook</span>
                      </div>
                      <textarea
                        className="composer-override-textarea"
                        value={descriptionFacebook}
                        onChange={(event) => setDescriptionFacebook(event.target.value)}
                        placeholder="Optional Facebook-specific copy..."
                        disabled={isReadOnly}
                        maxLength={63206}
                      />
                      <div className="composer-override-footer">
                        <span className="composer-character-count">
                          {formatCharacterCount(descriptionFacebook.length)} / 63,206
                        </span>
                      </div>
                      {state.fieldErrors?.descriptionFacebook?.map((error) => (
                        <span key={error} className="error-text">
                          {error}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {selectedPlatforms.includes(INSTAGRAM_PLATFORM) ? (
                    <div className="composer-override-card">
                      <div className="composer-override-card-head">
                        <div className="composer-override-card-title">
                          <span className="composer-override-card-icon is-instagram">
                            <InstagramIcon />
                          </span>
                          <div>
                            <strong>Instagram Override</strong>
                            <p>Leave blank to use Main Description.</p>
                          </div>
                        </div>
                        <span className="composer-override-pill is-platform">Instagram</span>
                      </div>
                      <textarea
                        className="composer-override-textarea"
                        value={descriptionInstagram}
                        onChange={(event) => setDescriptionInstagram(event.target.value)}
                        placeholder="Optional Instagram-specific caption..."
                        disabled={isReadOnly}
                        maxLength={2200}
                      />
                      <div className="composer-override-footer">
                        <span className="composer-character-count">
                          {formatCharacterCount(descriptionInstagram.length)} / 2,200
                        </span>
                      </div>
                      {state.fieldErrors?.descriptionInstagram?.map((error) => (
                        <span key={error} className="error-text">
                          {error}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {selectedPlatforms.includes(GOOGLE_PLATFORM) ? (
                    <div className="composer-override-card">
                      <div className="composer-override-card-head">
                        <div className="composer-override-card-title">
                          <span className="composer-override-card-icon is-google">
                            <GoogleIcon />
                          </span>
                          <div>
                            <strong>Google Business Override</strong>
                            <p>Leave blank to use Main Description.</p>
                          </div>
                        </div>
                        <span className="composer-override-pill is-platform">Google</span>
                      </div>
                      <textarea
                        className="composer-override-textarea"
                        value={descriptionGoogleBusiness}
                        onChange={(event) => setDescriptionGoogleBusiness(event.target.value)}
                        placeholder="Optional Google-specific update..."
                        disabled={isReadOnly}
                        maxLength={1500}
                      />
                      <div className="composer-override-footer">
                        <span className="composer-character-count">
                          {formatCharacterCount(descriptionGoogleBusiness.length)} / 1,500
                        </span>
                      </div>
                      {state.fieldErrors?.descriptionGoogleBusiness?.map((error) => (
                        <span key={error} className="error-text">
                          {error}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="composer-caption-tip-card">
              <span className="composer-caption-tip-icon" aria-hidden="true">
                <SparkleIcon />
              </span>
              <div className="composer-caption-tip-copy">
                <strong>Tip</strong>
                <p>Platform overrides let you tailor the same post for each destination.</p>
              </div>
            </div>

            {state.fieldErrors?.descriptionMain?.map((error) => (
              <span key={error} className="error-text">
                {error}
              </span>
            ))}
          </section>

          <section className="composer-section-card">
            <div className="composer-section-heading">
              <span className="composer-step-badge is-violet">3</span>
              <div>
                <h2>Media</h2>
              </div>
            </div>

            <MediaUploadField
              availableAssets={recentMediaAssets}
              selectedMediaAssetIds={selectedMediaAssetIds}
              onSelectedMediaAssetIdsChange={setSelectedMediaAssetIds}
              onSelectionSourceChange={setMediaSelectionSource}
              maxMediaCount={maxMediaCount}
              mediaLimitMessage={mediaLimitMessage}
              disabled={isReadOnly}
            />
            {state.fieldErrors?.mediaAssetIds?.map((error) => (
              <span key={error} className="error-text">
                {error}
              </span>
            ))}
          </section>

          <section className="composer-section-card composer-section-card--compact">
            <div className="composer-section-heading">
              <span className="composer-step-badge is-blue">3A</span>
              <div>
                <h2>Hashtags</h2>
              </div>
            </div>

            <div className="composer-hashtag-card">
              <div className="composer-hashtag-toolbar">
                {hashtagSettings?.groups.length ? (
                  <div className="composer-hashtag-group-controls">
                    <select
                      value={selectedHashtagGroupId}
                      onChange={(event) => setSelectedHashtagGroupId(event.target.value)}
                      disabled={isReadOnly}
                    >
                      <option value="">Apply Hashtag Group</option>
                      {hashtagSettings.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost-link-button"
                      onClick={applySelectedHashtagGroup}
                      disabled={isReadOnly || !selectedHashtagGroupId}
                    >
                      Apply
                    </button>
                  </div>
                ) : null}

                <div className="composer-hashtag-input-row">
                  <input
                    type="text"
                    className="composer-hashtag-input"
                    value={hashtagDraft}
                    onChange={(event) => setHashtagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "," || event.key === " ") {
                        event.preventDefault();
                        addHashtagsFromDraft(hashtagDraft);
                      }
                    }}
                    placeholder="Type a hashtag, then press space, comma, or Enter"
                    disabled={isReadOnly}
                  />
                  <button
                    type="button"
                    className="ghost-link-button"
                    onClick={() => addHashtagsFromDraft(hashtagDraft)}
                    disabled={isReadOnly || !hashtagDraft.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="composer-hashtag-meta">
                <span>{normalizedHashtags.length} hashtag{normalizedHashtags.length === 1 ? "" : "s"} added</span>
              </div>

              {normalizedHashtags.length > 0 ? (
                <div className="composer-hashtag-chip-list">
                  {normalizedHashtags.map((tag) => (
                    <span key={tag} className="composer-hashtag-chip">
                      {formatHashtagChipLabel(tag)}
                      <button
                        type="button"
                        onClick={() => removeHashtag(tag)}
                        disabled={isReadOnly}
                        aria-label={`Remove ${formatHashtagChipLabel(tag)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="composer-hashtag-empty">No hashtags added yet.</p>
              )}

              {state.fieldErrors?.hashtags?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>
          </section>

          {selectedPlatforms.includes(INSTAGRAM_PLATFORM) ? (
            <section className="composer-section-card composer-section-card--compact composer-instagram-comment-card">
              <div className="composer-description-header">
                <div>
                  <strong>Instagram First Comment</strong>
                  <p>Optional. Useful for hashtags or extra notes posted as the first comment.</p>
                </div>
                <button
                  type="button"
                  className={`composer-override-toggle${showInstagramFirstComment ? " is-active" : ""}`.trim()}
                  onClick={() => setShowInstagramFirstComment((current) => !current)}
                >
                  {showInstagramFirstComment ? "Hide first comment" : "Show first comment"}
                </button>
              </div>

              {showInstagramFirstComment ? (
                <div className="composer-override-card composer-instagram-comment-card">
                  <textarea
                    ref={instagramFirstCommentTextareaRef}
                    className="composer-override-textarea"
                    value={instagramFirstComment}
                    onChange={(event) => setInstagramFirstComment(event.target.value)}
                    placeholder="Optional first comment for Instagram..."
                    disabled={isReadOnly}
                    maxLength={2200}
                  />
                  <div className="composer-caption-footer">
                    <span className="composer-character-count">
                      {formatCharacterCount(instagramFirstComment.length)} / 2,200
                    </span>
                    {templateVariableOptions.length > 0 ? (
                      <div className="composer-card-actions">
                        <button
                          type="button"
                          className="ghost-link-button"
                          onClick={() =>
                            insertVariableToken(
                              instagramFirstCommentTextareaRef.current,
                              instagramFirstComment,
                              setInstagramFirstComment,
                            )
                          }
                          disabled={isReadOnly || !selectedVariableToken}
                        >
                          Insert {selectedVariableToken || "variable"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {state.fieldErrors?.instagramFirstComment?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="composer-section-card">
            <div className="composer-section-heading">
              <span className="composer-step-badge is-cyan">4</span>
              <div>
                <h2>Schedule</h2>
              </div>
            </div>

            <div className="composer-schedule-fields is-visible">
              <div className="composer-schedule-grid">
                <div className="field">
                  <label htmlFor="scheduledDate">Date</label>
                  <div className="composer-input-wrap">
                    <CalendarIcon />
                    <input
                      id="scheduledDate"
                      name="scheduledDate"
                      type="date"
                      value={scheduledDate}
                      onChange={(event) => setScheduledDate(event.target.value)}
                      disabled={isReadOnly}
                    />
                  </div>
                  {state.fieldErrors?.scheduledDate?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                </div>

                <div className="field">
                  <label>Time</label>
                  <div className="composer-time-grid">
                    <div className="composer-input-wrap">
                      <ClockIcon />
                      <select
                        name="scheduledHour"
                        value={scheduledHour}
                        onChange={(event) => setScheduledHour(event.target.value)}
                        disabled={isReadOnly}
                      >
                        {HOUR_OPTIONS.map((hour) => (
                          <option key={hour} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="composer-input-wrap">
                      <ClockIcon />
                      <select
                        name="scheduledMinute"
                        value={scheduledMinute}
                        onChange={(event) => setScheduledMinute(event.target.value)}
                        disabled={isReadOnly}
                      >
                        {minuteOptions.map((minute) => (
                          <option key={minute} value={minute}>
                            {minute}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="composer-input-wrap">
                      <ClockIcon />
                      <select
                        name="scheduledMeridiem"
                        value={scheduledMeridiem}
                        onChange={(event) => setScheduledMeridiem(event.target.value)}
                        disabled={isReadOnly}
                      >
                        {MERIDIEM_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {state.fieldErrors?.scheduledHour?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                  {state.fieldErrors?.scheduledMinute?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                  {state.fieldErrors?.scheduledMeridiem?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {!isReadOnly ? (
            <div className="composer-hero-actions composer-bottom-actions">
              <SubmitButton className="composer-action-button is-secondary" name="intent" value="draft">
                Save Draft
              </SubmitButton>
              <SubmitButton className="composer-action-button is-blue" name="intent" value="schedule">
                <CalendarIcon />
                <span>Schedule Post</span>
              </SubmitButton>
              <SubmitButton className="composer-action-button is-green" name="intent" value="publish">
                <PaperPlaneIcon />
                <span>Post Now</span>
              </SubmitButton>
            </div>
          ) : null}
        </section>

        <aside className="composer-preview-column">
          <div className="composer-preview-rail">
            <section className="composer-preview-card">
              <div className="composer-preview-header">
                <div>
                  <h2>Live Preview</h2>
                </div>
              </div>

              <div className="composer-preview-tabs">
                <button
                  type="button"
                  className={`composer-preview-tab${previewPlatform === "FACEBOOK" ? " is-active" : ""}`.trim()}
                  onClick={() => setPreviewPlatform("FACEBOOK")}
                >
                  <FacebookIcon />
                  <span>Facebook</span>
                </button>
                <button
                  type="button"
                  className={`composer-preview-tab${previewPlatform === "INSTAGRAM" ? " is-active" : ""}`.trim()}
                  onClick={() => setPreviewPlatform("INSTAGRAM")}
                >
                  <InstagramIcon />
                  <span>Instagram</span>
                </button>
                <button
                  type="button"
                  className={`composer-preview-tab${previewPlatform === "GOOGLE" ? " is-active" : ""}`.trim()}
                  onClick={() => setPreviewPlatform("GOOGLE")}
                >
                  <GoogleIcon />
                  <span>Google</span>
                </button>
              </div>

              {previewPlatform === "FACEBOOK" ? (
                <div className="composer-social-preview composer-social-preview--facebook">
                  <div className="composer-facebook-app-bar">
                    <span className="composer-facebook-wordmark">facebook</span>
                    <div className="composer-facebook-app-actions">
                      <span className="composer-facebook-app-dot" />
                      <span className="composer-facebook-app-dot" />
                    </div>
                  </div>

                  <div className="composer-social-preview-head">
                    <div className="composer-social-page">
                      <PreviewAvatar
                        profilePictureUrl={previewProfiles?.facebook?.profilePictureUrl}
                        alt={`${facebookPreviewName} profile`}
                        className="composer-social-avatar composer-social-avatar--tile"
                        fallback={<TileIcon />}
                      />
                      <div className="composer-social-page-meta">
                        <strong>{facebookPreviewName}</strong>
                        <span>Just now · Public</span>
                      </div>
                    </div>
                    <span className="composer-social-more">•••</span>
                  </div>

                  <p className="composer-social-caption">{facebookCaptionPreview}</p>

                  {previewVariant ? (
                    <div className="composer-social-media">
                      <img
                        src={getMediaVariantUrl(previewVariant.id)}
                        alt="Selected media preview"
                        className="composer-social-image"
                      />
                    </div>
                  ) : (
                    <div className="composer-social-media composer-social-media--empty">
                      <UploadCloudIcon />
                      <span>No media selected yet</span>
                      </div>
                    )}

                  <div className="composer-facebook-reactions">
                    <div className="composer-facebook-reaction-cluster">
                      <span className="composer-facebook-reaction-badge">👍</span>
                      <span className="composer-facebook-reaction-badge">💙</span>
                      <span>John Whitrey and 23 others</span>
                    </div>
                    <span>2 Comments</span>
                  </div>

                  <div className="composer-social-actions">
                    <span><LikeIcon /> <span>Like</span></span>
                    <span><CommentIcon /> <span>Comment</span></span>
                    <span><ShareIcon /> <span>Share</span></span>
                  </div>
                </div>
              ) : previewPlatform === "INSTAGRAM" ? (
                <div className="composer-instagram-preview-shell">
                  <div className="composer-instagram-preview-card">
                    <div className="composer-instagram-preview-head">
                      <div className="composer-instagram-preview-account">
                        <PreviewAvatar
                          profilePictureUrl={previewProfiles?.instagram?.profilePictureUrl}
                          alt={`@${instagramPreviewUsername} profile`}
                          className="composer-instagram-preview-avatar"
                          imageClassName="composer-instagram-preview-avatar-image"
                          fallback={<span aria-hidden="true" />}
                        />
                        <div className="composer-instagram-preview-account-copy">
                          <strong>{instagramPreviewUsername}</strong>
                          <span>{instagramPreviewSubtitle}</span>
                        </div>
                      </div>
                      <span className="composer-instagram-preview-more" aria-hidden="true">
                        <MoreDotsIcon />
                      </span>
                    </div>

                    {previewVariant ? (
                      <div className="composer-instagram-preview-media">
                        <img
                          src={getMediaVariantUrl(previewVariant.id)}
                          alt="Selected media preview"
                          className="composer-instagram-preview-image"
                        />
                      </div>
                    ) : (
                      <div className="composer-instagram-preview-media composer-instagram-preview-media--empty">
                        <UploadCloudIcon />
                        <span>No media selected yet</span>
                      </div>
                    )}

                    <div className="composer-instagram-preview-actions">
                      <div className="composer-instagram-preview-action-group">
                        <LikeIcon />
                        <CommentIcon />
                        <PaperPlaneIcon />
                      </div>
                      <BookmarkIcon />
                    </div>

                    <div className="composer-instagram-preview-body">
                      <strong>212 Likes</strong>
                      <p>
                        <span>{instagramPreviewUsername}</span> {instagramCaptionPreview}
                      </p>
                      {instagramFirstCommentPreview ? (
                        <div className="composer-instagram-first-comment-preview">
                          <span>First comment</span>
                          <p>{instagramFirstCommentPreview}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="composer-google-preview">
                  <div className="composer-google-preview-head">
                    <div className="composer-google-preview-page">
                      <PreviewAvatar
                        profilePictureUrl={previewProfiles?.google?.profilePictureUrl}
                        alt={`${googlePreviewName} profile`}
                        className="composer-social-avatar composer-social-avatar--tile"
                        fallback={<TileIcon />}
                      />
                      <div className="composer-google-preview-page-copy">
                        <strong>{googlePreviewName}</strong>
                        <span>{googlePreviewSubtitle}</span>
                      </div>
                    </div>
                    <span className="composer-google-preview-more">⋮</span>
                  </div>
                  {previewVariant ? (
                    <div className="composer-google-preview-media">
                      <img
                        src={getMediaVariantUrl(previewVariant.id)}
                        alt="Selected media preview"
                        className="composer-google-preview-image"
                      />
                    </div>
                  ) : (
                    <div className="composer-google-preview-media composer-google-preview-media--empty">
                      <UploadCloudIcon />
                      <span>No media selected yet</span>
                    </div>
                  )}
                  <div className="composer-google-preview-body">
                    <p>{googleCaptionPreview}</p>
                  </div>
                  <div className="composer-google-preview-footer">
                    <ShareIcon />
                  </div>
                </div>
              )}
            </section>

            {post?.id ? <section className="composer-summary-card">
              <div className="composer-summary-header">
                <h2>Post Summary</h2>
              </div>

              <div className="composer-summary-list">
                <div className="composer-summary-row">
                  <span className="composer-summary-icon"><FacebookIcon /></span>
                  <span className="composer-summary-label">Platform(s)</span>
                  <span className="composer-summary-value">
                    {selectedPlatforms.length > 0
                      ? selectedPlatforms
                          .map((platform) =>
                            platform === FACEBOOK_PLATFORM
                              ? "Facebook"
                              : platform === INSTAGRAM_PLATFORM
                                ? "Instagram"
                                : "Google Business"
                          )
                          .join(", ")
                      : "No platforms selected"}
                  </span>
                </div>
                <div className="composer-summary-row">
                  <span className="composer-summary-icon"><CalendarIcon /></span>
                  <span className="composer-summary-label">Scheduled For</span>
                  <span className="composer-summary-value">{scheduledForLabel}</span>
                </div>
                <div className="composer-summary-row">
                  <span className="composer-summary-icon"><ComposeIcon /></span>
                  <span className="composer-summary-label">Post Type</span>
                  <span className="composer-summary-value">{postTypeLabel}</span>
                </div>
                <div className="composer-summary-row">
                  <span className="composer-summary-icon"><GalleryIcon /></span>
                  <span className="composer-summary-label">Media Count</span>
                  <span className="composer-summary-value">{mediaCountLabel}</span>
                </div>
                {post?.platformResults?.map((platformResult) => (
                  <div key={`summary-platform-${platformResult.platform}`} className="composer-summary-row">
                    <span className="composer-summary-icon">
                      {platformResult.platform === FACEBOOK_PLATFORM ? (
                        <FacebookIcon />
                      ) : platformResult.platform === INSTAGRAM_PLATFORM ? (
                        <InstagramIcon />
                      ) : (
                        <GoogleIcon />
                      )}
                    </span>
                    <span className="composer-summary-label">
                      {platformResult.platform === FACEBOOK_PLATFORM
                        ? "Facebook"
                        : platformResult.platform === INSTAGRAM_PLATFORM
                          ? "Instagram"
                          : "Google Business"}
                    </span>
                    <span className={`composer-summary-value badge is-${platformResult.tone}`.trim()}>
                      {platformResult.label}
                    </span>
                  </div>
                ))}
                {post?.createdByLabel ? (
                  <div className="composer-summary-row">
                    <span className="composer-summary-icon"><ComposeIcon /></span>
                    <span className="composer-summary-label">Created By</span>
                    <span className="composer-summary-value">
                      {post.createdByLabel}{post.createdAtLabel ? ` · ${post.createdAtLabel}` : ""}
                    </span>
                  </div>
                ) : null}
                {post?.updatedByLabel ? (
                  <div className="composer-summary-row">
                    <span className="composer-summary-icon"><ComposeIcon /></span>
                    <span className="composer-summary-label">Last Edited</span>
                    <span className="composer-summary-value">
                      {post.updatedByLabel}{post.updatedAtLabel ? ` · ${post.updatedAtLabel}` : ""}
                    </span>
                  </div>
                ) : null}
              </div>

            </section> : null}
          </div>
        </aside>
      </div>
    </form>
  );
}
