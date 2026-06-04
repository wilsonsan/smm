"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { savePostAction } from "@/app/dashboard/posts/actions";
import { SubmitButton } from "@/components/submit-button";
import { MediaUploadField } from "@/components/media-upload-field";
import { type MediaAssetSummary } from "@/lib/media-presentation";
import { getSchedulerTimezoneLabel, SCHEDULER_MINUTE_OPTIONS } from "@/lib/time";
import { initialFormState } from "@/lib/validation";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));

type PostEditorFormProps = {
  post?: {
    id: string;
    caption: string;
    scheduledDate: string;
    scheduledHour: string;
    scheduledMinute: string;
    scheduledMeridiem: string;
    status: string;
    mediaAsset?: MediaAssetSummary | null;
  };
  recentMediaAssets: MediaAssetSummary[];
  timezone: string;
  isReadOnly?: boolean;
  backHref?: string;
};

export function PostEditorForm({
  post,
  recentMediaAssets,
  timezone,
  isReadOnly = false,
  backHref = "/dashboard/calendar",
}: PostEditorFormProps) {
  const [state, formAction] = useActionState(savePostAction, initialFormState);
  const timezoneLabel = getSchedulerTimezoneLabel(timezone);
  const fallbackValues = useMemo(
    () => ({
      caption: post?.caption ?? "",
      scheduledDate: post?.scheduledDate ?? "",
      scheduledHour: post?.scheduledHour ?? "5",
      scheduledMinute: post?.scheduledMinute ?? "00",
      scheduledMeridiem: post?.scheduledMeridiem ?? "PM",
      mediaAssetId: post?.mediaAsset?.id ?? "",
      platform: "FACEBOOK",
    }),
    [post],
  );

  const formValues = state.submittedValues ?? fallbackValues;

  const [caption, setCaption] = useState(formValues.caption);
  const [scheduledDate, setScheduledDate] = useState(formValues.scheduledDate);
  const [scheduledHour, setScheduledHour] = useState(formValues.scheduledHour);
  const [scheduledMinute, setScheduledMinute] = useState(formValues.scheduledMinute);
  const [scheduledMeridiem, setScheduledMeridiem] = useState(formValues.scheduledMeridiem);
  const [selectedMediaAssetId, setSelectedMediaAssetId] = useState(formValues.mediaAssetId);

  useEffect(() => {
    setCaption(formValues.caption);
    setScheduledDate(formValues.scheduledDate);
    setScheduledHour(formValues.scheduledHour);
    setScheduledMinute(formValues.scheduledMinute);
    setScheduledMeridiem(formValues.scheduledMeridiem);
    setSelectedMediaAssetId(formValues.mediaAssetId);
  }, [
    formValues.caption,
    formValues.mediaAssetId,
    formValues.scheduledDate,
    formValues.scheduledHour,
    formValues.scheduledMeridiem,
    formValues.scheduledMinute,
  ]);

  const resolvedSelectedMediaAsset = useMemo(() => {
    if (!selectedMediaAssetId) {
      return post?.mediaAsset ?? null;
    }

    return (
      recentMediaAssets.find((asset) => asset.id === selectedMediaAssetId) ??
      (post?.mediaAsset?.id === selectedMediaAssetId ? post.mediaAsset : null)
    );
  }, [post?.mediaAsset, recentMediaAssets, selectedMediaAssetId]);

  const minuteOptions = SCHEDULER_MINUTE_OPTIONS.includes(
    scheduledMinute as (typeof SCHEDULER_MINUTE_OPTIONS)[number],
  )
    ? [...SCHEDULER_MINUTE_OPTIONS]
    : [scheduledMinute || "00", ...SCHEDULER_MINUTE_OPTIONS];

  return (
    <form action={formAction} className="panel form-card form-grid">
      <input type="hidden" name="postId" value={post?.id ?? ""} />

      <div className="page-header">
        <div>
          <h2 style={{ fontSize: "1.35rem" }}>{post ? "Post details" : "Compose post"}</h2>
          <p>
            Scheduled times use <strong>{timezoneLabel}</strong> and save to the database in UTC.
          </p>
        </div>
        <Link href={backHref} className="secondary-button" style={{ display: "inline-flex", alignItems: "center" }}>
          Back
        </Link>
      </div>

      <div className="field">
        <label htmlFor="caption">Description / Caption</label>
        <textarea
          id="caption"
          name="caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Fresh tile install with clean lines and warm tones..."
          disabled={isReadOnly}
        />
        <span className="hint">Text-only posts are allowed. Caption is required when scheduling or posting now.</span>
        {state.fieldErrors?.caption?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      <div className="grid-3">
        <div className="field">
          <label htmlFor="platform">Platform</label>
          <select id="platform" name="platform" value="FACEBOOK" disabled={isReadOnly} onChange={() => undefined}>
            <option value="FACEBOOK">Facebook</option>
          </select>
          <span className="hint">Instagram and Google remain future-ready in the schema but are not active yet.</span>
          {state.fieldErrors?.platform?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field">
          <label htmlFor="scheduledDate">Scheduled date</label>
          <input
            id="scheduledDate"
            name="scheduledDate"
            type="date"
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
            disabled={isReadOnly}
          />
          <span className="hint">Drafts can still use this to appear on the calendar before they are scheduled.</span>
          {state.fieldErrors?.scheduledDate?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field">
          <label>{timezoneLabel}</label>
          <div className="time-select-grid">
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

            <select
              name="scheduledMeridiem"
              value={scheduledMeridiem}
              onChange={(event) => setScheduledMeridiem(event.target.value)}
              disabled={isReadOnly}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <span className="hint">Quarter-hour scheduling only. Seconds are always saved as `00`.</span>
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

      <MediaUploadField
        initialAsset={resolvedSelectedMediaAsset}
        recentAssets={recentMediaAssets}
        selectedMediaAssetId={selectedMediaAssetId}
        onSelectedMediaAssetIdChange={setSelectedMediaAssetId}
      />

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      {!isReadOnly ? (
        <div className="button-row">
          <SubmitButton className="secondary-button" name="intent" value="draft">
            Save Draft
          </SubmitButton>
          <SubmitButton className="primary-button" name="intent" value="schedule">
            Schedule Post
          </SubmitButton>
          <SubmitButton className="primary-button" name="intent" value="publish">
            Post Now
          </SubmitButton>
          <Link href={backHref} className="ghost-link-button">
            Cancel
          </Link>
        </div>
      ) : (
        <p className="muted">This post is read-only because it is already publishing or published.</p>
      )}
    </form>
  );
}
