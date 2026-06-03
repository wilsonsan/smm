"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/dashboard/settings/actions";
import { initialFormState } from "@/lib/validation";
import { SubmitButton } from "@/components/submit-button";

type SettingsFormProps = {
  initialValues: {
    publicAppUrl: string;
    uploadDirectory: string;
  };
  envFlags: {
    facebookAppIdConfigured: boolean;
    facebookAppSecretConfigured: boolean;
  };
};

export function SettingsForm({ initialValues, envFlags }: SettingsFormProps) {
  const [state, formAction] = useActionState(saveSettingsAction, initialFormState);

  return (
    <form action={formAction} className="panel form-card form-grid">
      <div className="grid-2">
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
          <span className="hint">Relative paths resolve from the app workspace. Absolute paths are also supported.</span>
          {state.fieldErrors?.uploadDirectory?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>Facebook App ID</label>
          <input value={envFlags.facebookAppIdConfigured ? "Configured via environment" : "Not configured"} readOnly />
        </div>

        <div className="field">
          <label>Facebook App Secret</label>
          <input value={envFlags.facebookAppSecretConfigured ? "Configured via environment" : "Not configured"} readOnly />
        </div>
      </div>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row">
        <SubmitButton className="primary-button">Save Settings</SubmitButton>
      </div>
    </form>
  );
}

