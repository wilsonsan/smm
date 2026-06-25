"use client";

import { useActionState } from "react";
import { saveDeveloperSettingsAction } from "@/app/dashboard/settings/actions";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

type DeveloperSettingsPanelProps = {
  initialValues: {
    facebook: boolean;
    instagram: boolean;
    google: boolean;
  };
};

export function DeveloperSettingsPanel({ initialValues }: DeveloperSettingsPanelProps) {
  const [state, formAction] = useActionState(saveDeveloperSettingsAction, initialFormState);

  return (
    <form action={formAction} className="panel settings-section-card">
      <div className="settings-section-head">
        <div>
          <span className="settings-eyebrow">System Settings</span>
          <h3>Developer</h3>
          <p>Use these toggles to unlock platform options in the composer without live channel logins while you test New Post features.</p>
        </div>
        <span className="settings-count">Dev only</span>
      </div>

      <section className="settings-subcard">
        <div className="settings-subcard-head">
          <div>
            <strong>Platform Dev Overrides</strong>
            <p>These overrides only unlock platform availability in the composer. They do not replace real OAuth connections for live publishing.</p>
          </div>
          <span className="settings-chip">Testing</span>
        </div>

        <div className="form-grid">
          <label className="developer-toggle-card">
            <div className="developer-toggle-copy">
              <strong>Facebook</strong>
              <p>Keep Facebook available in the composer even if the normal connection flow is not finished.</p>
            </div>
            <span className="developer-toggle-control">
              <span>{initialValues.facebook ? "Enabled" : "Disabled"}</span>
              <span className="account-mfa-toggle">
                <input type="checkbox" name="facebook" defaultChecked={initialValues.facebook} />
                <span className="account-mfa-toggle-track">
                  <span className="account-mfa-toggle-thumb" />
                </span>
              </span>
            </span>
          </label>

          <label className="developer-toggle-card">
            <div className="developer-toggle-copy">
              <strong>Instagram</strong>
              <p>Unlock Instagram in the composer without needing a linked Instagram Business or Creator account.</p>
            </div>
            <span className="developer-toggle-control">
              <span>{initialValues.instagram ? "Enabled" : "Disabled"}</span>
              <span className="account-mfa-toggle">
                <input type="checkbox" name="instagram" defaultChecked={initialValues.instagram} />
                <span className="account-mfa-toggle-track">
                  <span className="account-mfa-toggle-thumb" />
                </span>
              </span>
            </span>
          </label>

          <label className="developer-toggle-card">
            <div className="developer-toggle-copy">
              <strong>Google Business</strong>
              <p>Unlock Google Business in the composer without needing an active Google OAuth connection or selected location.</p>
            </div>
            <span className="developer-toggle-control">
              <span>{initialValues.google ? "Enabled" : "Disabled"}</span>
              <span className="account-mfa-toggle">
                <input type="checkbox" name="google" defaultChecked={initialValues.google} />
                <span className="account-mfa-toggle-track">
                  <span className="account-mfa-toggle-thumb" />
                </span>
              </span>
            </span>
          </label>

          {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

          <div className="button-row">
            <SubmitButton className="primary-button">Save Developer Settings</SubmitButton>
          </div>
        </div>
      </section>
    </form>
  );
}
