"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/dashboard/account/actions";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

export function AccountPasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialFormState);

  return (
    <form action={formAction} className="form-grid">
      <div className="field">
        <label htmlFor="currentPassword">Current Password</label>
        <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" />
        {state.fieldErrors?.currentPassword?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="newPassword">New Password</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" />
          <span className="hint">Use at least 12 characters, including uppercase, lowercase, and a number.</span>
          {state.fieldErrors?.newPassword?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field">
          <label htmlFor="confirmNewPassword">Confirm New Password</label>
          <input
            id="confirmNewPassword"
            name="confirmNewPassword"
            type="password"
            autoComplete="new-password"
          />
          {state.fieldErrors?.confirmNewPassword?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>
      </div>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row">
        <SubmitButton className="primary-button">Change Password</SubmitButton>
      </div>
    </form>
  );
}
