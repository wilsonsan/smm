"use client";

import { useActionState } from "react";
import { savePostAction } from "@/app/dashboard/posts/actions";
import { SubmitButton } from "@/components/submit-button";
import { MediaUploadField } from "@/components/media-upload-field";
import { initialFormState } from "@/lib/validation";

type PostEditorFormProps = {
  post?: {
    id: string;
    internalTitle: string;
    caption: string;
    scheduledAt: string;
    status: string;
    mediaAsset?: {
      id: string;
      originalFilename: string;
      mimeType: string;
      width: number;
      height: number;
      sizeBytes: string;
    } | null;
  };
};

export function PostEditorForm({ post }: PostEditorFormProps) {
  const [state, formAction] = useActionState(savePostAction, initialFormState);

  return (
    <form action={formAction} className="panel form-card form-grid">
      <input type="hidden" name="postId" value={post?.id ?? ""} />

      <div className="field">
        <label htmlFor="internalTitle">Internal title</label>
        <input
          id="internalTitle"
          name="internalTitle"
          defaultValue={post?.internalTitle ?? ""}
          placeholder="June backsplash before/after"
          required
        />
        {state.fieldErrors?.internalTitle?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      <div className="field">
        <label htmlFor="caption">Caption</label>
        <textarea
          id="caption"
          name="caption"
          defaultValue={post?.caption ?? ""}
          placeholder="Fresh tile install with clean lines and warm tones..."
          required
        />
        {state.fieldErrors?.caption?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="scheduledAt">Scheduled date/time</label>
          <input id="scheduledAt" name="scheduledAt" type="datetime-local" defaultValue={post?.scheduledAt ?? ""} />
          <span className="hint">Optional for drafts. Required when scheduling.</span>
          {state.fieldErrors?.scheduledAt?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field">
          <label htmlFor="platform">Platform</label>
          <select id="platform" name="platform" defaultValue="FACEBOOK">
            <option value="FACEBOOK">Facebook</option>
          </select>
          <span className="hint">Instagram and Google Business are in the schema but intentionally disabled in the UI for now.</span>
          {state.fieldErrors?.platform?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>
      </div>

      <MediaUploadField initialAsset={post?.mediaAsset ?? null} />

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row">
        <SubmitButton className="secondary-button" name="intent" value="draft">
          Save Draft
        </SubmitButton>
        <SubmitButton className="primary-button" name="intent" value="schedule">
          Schedule Post
        </SubmitButton>
      </div>
    </form>
  );
}

