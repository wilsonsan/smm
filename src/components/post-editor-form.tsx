"use client";

/* eslint-disable @next/next/no-img-element */
import { useActionState, useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { savePostAction } from "@/app/dashboard/posts/actions";
import {
  CalendarIcon,
  ClockIcon,
  ComposeIcon,
  FacebookIcon,
  GalleryIcon,
} from "@/components/dashboard-icons";
import { MediaUploadField } from "@/components/media-upload-field";
import { SubmitButton } from "@/components/submit-button";
import {
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  type MediaAssetSummary,
} from "@/lib/media-presentation";
import { getMaxMediaCountForPlatforms, getPlatformMediaLimitMessage } from "@/lib/platform-rules";
import { getSchedulerTimezoneLabel, SCHEDULER_MINUTE_OPTIONS } from "@/lib/time";
import { initialFormState } from "@/lib/validation";
import type { GoogleFoundationState } from "@/lib/google";
import type { InstagramFoundationState } from "@/lib/instagram";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MERIDIEM_OPTIONS = ["AM", "PM"] as const;
const FACEBOOK_PLATFORM = "FACEBOOK";
const INSTAGRAM_PLATFORM = "INSTAGRAM";
const GOOGLE_PLATFORM = "GOOGLE_BUSINESS";
const CAPTION_LIMIT = 5000;

type PostEditorFormProps = {
  post?: {
    id: string;
    caption: string;
    scheduledDate: string;
    scheduledHour: string;
    scheduledMinute: string;
    scheduledMeridiem: string;
    status: string;
    mediaAssets: MediaAssetSummary[];
    platforms: string[];
    createdFrom?: string;
    createdByLabel?: string;
    createdAtLabel?: string;
    updatedByLabel?: string;
    updatedAtLabel?: string;
  };
  recentMediaAssets: MediaAssetSummary[];
  timezone: string;
  instagramFoundation?: InstagramFoundationState;
  googleFoundation?: GoogleFoundationState;
  isReadOnly?: boolean;
  hideHeroCopy?: boolean;
};

type PreviewPlatform = "FACEBOOK" | "GOOGLE";

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
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "facebook" | "google" | "instagram";
  selected?: boolean;
  hint?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
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
        <span>{hint ?? (selected ? "Selected for this post" : disabled ? "Not available yet" : "Tap to select")}</span>
      </span>
      <span className="composer-platform-indicator">
        {selected ? "Selected" : disabled ? "Locked" : "Available"}
      </span>
    </button>
  );
}

export function PostEditorForm({
  post,
  recentMediaAssets,
  timezone,
  instagramFoundation,
  googleFoundation,
  isReadOnly = false,
  hideHeroCopy = false,
}: PostEditorFormProps) {
  const [state, formAction] = useActionState(savePostAction, initialFormState);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>("FACEBOOK");
  const timezoneLabel = getSchedulerTimezoneLabel(timezone);

  const fallbackValues = useMemo(
    () => ({
      caption: post?.caption ?? "",
      scheduledDate: post?.scheduledDate ?? "",
      scheduledHour: post?.scheduledHour ?? "5",
      scheduledMinute: post?.scheduledMinute ?? "00",
      scheduledMeridiem: post?.scheduledMeridiem ?? "PM",
      mediaAssetIds: post?.mediaAssets.map((asset) => asset.id) ?? [],
      platforms: post?.platforms.length ? post.platforms : [FACEBOOK_PLATFORM],
      mediaSelectionSource: "",
    }),
    [post],
  );

  const formValues = state.submittedValues ?? fallbackValues;

  const [caption, setCaption] = useState(formValues.caption);
  const [scheduledDate, setScheduledDate] = useState(formValues.scheduledDate);
  const [scheduledHour, setScheduledHour] = useState(formValues.scheduledHour);
  const [scheduledMinute, setScheduledMinute] = useState(formValues.scheduledMinute);
  const [scheduledMeridiem, setScheduledMeridiem] = useState(formValues.scheduledMeridiem);
  const [selectedMediaAssetIds, setSelectedMediaAssetIds] = useState(formValues.mediaAssetIds);
  const [selectedPlatforms, setSelectedPlatforms] = useState(formValues.platforms);
  const [mediaSelectionSource, setMediaSelectionSource] = useState(formValues.mediaSelectionSource ?? "");

  useEffect(() => {
    setCaption(formValues.caption);
    setScheduledDate(formValues.scheduledDate);
    setScheduledHour(formValues.scheduledHour);
    setScheduledMinute(formValues.scheduledMinute);
    setScheduledMeridiem(formValues.scheduledMeridiem);
    setSelectedMediaAssetIds(formValues.mediaAssetIds);
    setSelectedPlatforms(formValues.platforms);
    setMediaSelectionSource(formValues.mediaSelectionSource ?? "");
  }, [
    formValues.caption,
    formValues.mediaAssetIds,
    formValues.mediaSelectionSource,
    formValues.platforms,
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
  const maxMediaCount = getMaxMediaCountForPlatforms(selectedPlatforms);
  const mediaLimitMessage =
    selectedMediaAssetIds.length > maxMediaCount ? getPlatformMediaLimitMessage(selectedPlatforms) : null;
  const captionPreview = caption.trim() || "Fresh tile install with clean lines and warm tones...";
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
  const instagramHint =
    instagramFoundation?.status === "READY"
      ? `Linked as @${instagramFoundation.username || "instagram"}`
      : instagramFoundation?.message || "Link a connected Instagram Business account first";
  return (
    <form ref={formRef} action={formAction} className="composer-shell">
      <input type="hidden" name="postId" value={post?.id ?? ""} />
      <input type="hidden" name="createdFrom" value={post?.createdFrom ?? ""} />
      <input type="hidden" name="mediaSelectionSource" value={mediaSelectionSource} />
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
              <span className="composer-step-badge">1</span>
              <div>
                <h2>Caption</h2>
              </div>
            </div>

            <div className="composer-caption-shell">
              <span className="composer-caption-sparkle" aria-hidden="true">
                <SparkleIcon />
              </span>
              <textarea
                id="caption"
                name="caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Fresh tile install with clean lines and warm tones..."
                disabled={isReadOnly}
                className="composer-caption-textarea"
              />
              <div className="composer-caption-footer">
                <span className="composer-character-count">
                  {caption.length} / {CAPTION_LIMIT}
                </span>
              </div>
            </div>

            {state.fieldErrors?.caption?.map((error) => (
              <span key={error} className="error-text">
                {error}
              </span>
            ))}
          </section>

          <section className="composer-section-card">
            <div className="composer-section-heading">
              <span className="composer-step-badge is-blue">2</span>
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
                hint="Available now"
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
                hint={googleFoundation?.status === "READY" ? "Available now" : googleFoundation?.message || "Connect Google Business first"}
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
                hint={instagramHint}
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
                      <div className="composer-social-avatar composer-social-avatar--tile">
                        <TileIcon />
                      </div>
                      <div className="composer-social-page-meta">
                        <strong>NC Tile Pros</strong>
                        <span>Just now · Public</span>
                      </div>
                    </div>
                    <span className="composer-social-more">•••</span>
                  </div>

                  <p className="composer-social-caption">{captionPreview}</p>

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
              ) : (
                <div className="composer-google-preview">
                  <div className="composer-google-preview-head">
                    <div className="composer-google-preview-page">
                      <div className="composer-social-avatar composer-social-avatar--tile">
                        <TileIcon />
                      </div>
                      <div className="composer-google-preview-page-copy">
                        <strong>NC Tile Pros</strong>
                        <span>{googlePreviewDateLabel}</span>
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
                    <p>{captionPreview}</p>
                  </div>
                  <div className="composer-google-preview-footer">
                    <ShareIcon />
                  </div>
                </div>
              )}
            </section>

            <section className="composer-summary-card">
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

            </section>
          </div>
        </aside>
      </div>
    </form>
  );
}
