"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/app/dashboard/account/actions";
import { EyeIcon, EyeOffIcon, LockIcon, SuccessIcon } from "@/components/dashboard-icons";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

export function AccountPasswordForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(changePasswordAction, initialFormState);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="account-settings-form">
      <div className="field account-settings-field">
        <label htmlFor="currentPassword">Current Password</label>
        <div className="account-settings-input-shell has-trailing-action">
          <span className="account-settings-input-icon" aria-hidden="true">
            <LockIcon />
          </span>
          <input
            id="currentPassword"
            name="currentPassword"
            type={showCurrentPassword ? "text" : "password"}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="account-settings-visibility-button"
            aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
            onClick={() => setShowCurrentPassword((current) => !current)}
          >
            {showCurrentPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {state.fieldErrors?.currentPassword?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      <div className="account-settings-input-grid">
        <div className="field account-settings-field">
          <label htmlFor="newPassword">New Password</label>
          <div className="account-settings-input-shell has-trailing-action">
            <span className="account-settings-input-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <input
              id="newPassword"
              name="newPassword"
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="account-settings-visibility-button"
              aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              onClick={() => setShowNewPassword((current) => !current)}
            >
              {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {state.fieldErrors?.newPassword?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field account-settings-field">
          <label htmlFor="confirmNewPassword">Confirm New Password</label>
          <div className="account-settings-input-shell has-trailing-action">
            <span className="account-settings-input-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <input
              id="confirmNewPassword"
              name="confirmNewPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="account-settings-visibility-button"
              aria-label={showConfirmPassword ? "Hide confirm new password" : "Show confirm new password"}
              onClick={() => setShowConfirmPassword((current) => !current)}
            >
              {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {state.fieldErrors?.confirmNewPassword?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>
      </div>

      <p className="account-settings-password-helper">
        <span className="account-settings-password-helper-icon" aria-hidden="true">
          <SuccessIcon />
        </span>
        <span>Use at least 12 characters, including uppercase, lowercase, and a number.</span>
      </p>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row account-settings-button-row">
        <SubmitButton className="account-settings-primary-button">Update Password</SubmitButton>
      </div>
    </form>
  );
}
