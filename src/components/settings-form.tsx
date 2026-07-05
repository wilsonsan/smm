"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/dashboard/settings/actions";
import { initialFormState } from "@/lib/validation";
import { SubmitButton } from "@/components/submit-button";

type SettingsFormProps = {
  initialValues: {
    siteName: string;
    siteFaviconUrl: string;
    publicAppUrl: string;
    uploadDirectory: string;
    appTimezone: string;
    galleryStorageLimitGb: number;
  };
};

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const [state, formAction] = useActionState(saveSettingsAction, initialFormState);

  return (
    <form action={formAction} className="panel settings-section-card">
      <div className="settings-section-head">
        <div>
          <span className="settings-eyebrow">General</span>
          <h3>Site Settings</h3>
          <p>These are the core values the app uses everywhere.</p>
        </div>
      </div>

      <section className="settings-subcard">
        <div className="settings-subcard-head">
          <div>
            <strong>Brand And Paths</strong>
            <p>Only the fields you typically change once in a while.</p>
          </div>
        </div>

        <div className="form-grid">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="siteName">Site name</label>
              <input id="siteName" name="siteName" defaultValue={initialValues.siteName} required />
              {state.fieldErrors?.siteName?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>

            <div className="field">
              <label htmlFor="siteFaviconUrl">Favicon path or URL</label>
              <input id="siteFaviconUrl" name="siteFaviconUrl" defaultValue={initialValues.siteFaviconUrl} required />
              <span className="hint">Use a local path like `/social-media-favicon.svg` or a full URL.</span>
              {state.fieldErrors?.siteFaviconUrl?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>

            <div className="field">
              <label htmlFor="publicAppUrl">Public app URL</label>
              <input id="publicAppUrl" name="publicAppUrl" defaultValue={initialValues.publicAppUrl} required />
              {state.fieldErrors?.publicAppUrl?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>

            <div className="field">
              <label htmlFor="uploadDirectory">Upload directory</label>
              <input id="uploadDirectory" name="uploadDirectory" defaultValue={initialValues.uploadDirectory} required />
              <span className="hint">Relative paths resolve from the app workspace. Absolute paths also work.</span>
              {state.fieldErrors?.uploadDirectory?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>

            <div className="field">
              <label htmlFor="appTimezone">App timezone</label>
              <input id="appTimezone" name="appTimezone" defaultValue={initialValues.appTimezone} required />
              <span className="hint">Use an IANA timezone such as `America/New_York`.</span>
              {state.fieldErrors?.appTimezone?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>

            <div className="field">
              <label htmlFor="galleryStorageLimitGb">Gallery storage limit (GB)</label>
              <input
                id="galleryStorageLimitGb"
                name="galleryStorageLimitGb"
                type="number"
                min={1}
                step={1}
                defaultValue={initialValues.galleryStorageLimitGb}
                required
              />
              <span className="hint">Controls the gallery storage usage card. Default is 50 GB.</span>
              {state.fieldErrors?.galleryStorageLimitGb?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>
          </div>

          {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

          <div className="button-row">
            <SubmitButton className="primary-button">Save Site Settings</SubmitButton>
          </div>
        </div>
      </section>
    </form>
  );
}
