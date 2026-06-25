"use client";

import { useActionState } from "react";
import { verifyMfaLoginAction } from "@/app/login/actions";
import { LockIcon } from "@/components/dashboard-icons";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

export function LoginMfaForm() {
  const [state, formAction] = useActionState(verifyMfaLoginAction, initialFormState);

  return (
    <form action={formAction} className="form-grid">
      <div className="field">
        <label htmlFor="verificationCode">Authentication Code</label>
        <div className="account-settings-input-shell">
          <span className="account-settings-input-icon" aria-hidden="true">
            <LockIcon />
          </span>
          <input
            id="verificationCode"
            name="verificationCode"
            autoComplete="one-time-code"
            inputMode="text"
            placeholder="6-digit code or recovery code"
            required
          />
        </div>
        <span className="muted-text">Use the current code from your authenticator app or one unused recovery code.</span>
        {state.fieldErrors?.verificationCode?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <SubmitButton className="primary-button">Verify &amp; Sign In</SubmitButton>
    </form>
  );
}
