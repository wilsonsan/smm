"use client";

import { useActionState } from "react";
import { saveInsertContentTemplatesAction } from "@/app/dashboard/settings/actions";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";
import type { InsertContentTemplates } from "@/lib/settings";

type InsertContentSettingsPanelProps = {
  initialValues: InsertContentTemplates;
};

export function InsertContentSettingsPanel({ initialValues }: InsertContentSettingsPanelProps) {
  const [state, formAction] = useActionState(saveInsertContentTemplatesAction, initialFormState);

  return (
    <form action={formAction} className="panel settings-section-card">
      <div className="settings-section-head">
        <div>
          <span className="settings-eyebrow">Posts</span>
          <h3>Insert Content</h3>
          <p>These saved snippets power the quick insert buttons in the caption editor.</p>
        </div>
      </div>

      <section className="settings-subcard">
        <div className="settings-subcard-head">
          <div>
            <strong>Saved Snippets</strong>
            <p>Changes show up in New Post right away.</p>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="insert-content-signature">Signature</label>
            <textarea
              id="insert-content-signature"
              name="signature"
              rows={4}
              defaultValue={initialValues.signature}
              placeholder="Thanks, NC Tile Pros"
            />
            {state.fieldErrors?.signature?.map((error) => (
              <span key={error} className="error-text">
                {error}
              </span>
            ))}
          </div>

          <div className="insert-content-settings-stack">
            <div className="field">
              <label htmlFor="insert-content-phone-number">Phone Number</label>
              <input
                id="insert-content-phone-number"
                name="phoneNumber"
                defaultValue={initialValues.phoneNumber}
                placeholder="919.244.9606"
              />
              {state.fieldErrors?.phoneNumber?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>

            <div className="field">
              <label htmlFor="insert-content-email">Email</label>
              <input
                id="insert-content-email"
                name="email"
                defaultValue={initialValues.email}
                placeholder="hello@nctilepros.com"
              />
              {state.fieldErrors?.email?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>

            <div className="field">
              <label htmlFor="insert-content-website">Website</label>
              <input
                id="insert-content-website"
                name="website"
                defaultValue={initialValues.website}
                placeholder="https://nctilepros.com"
              />
              {state.fieldErrors?.website?.map((error) => (
                <span key={error} className="error-text">
                  {error}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row">
        <SubmitButton className="primary-button">Save Insert Content</SubmitButton>
      </div>
    </form>
  );
}
