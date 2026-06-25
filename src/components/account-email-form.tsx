"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changeAccountEmailAction } from "@/app/dashboard/account/actions";
import { LockIcon, MailIcon } from "@/components/dashboard-icons";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

type AccountEmailFormProps = {
  currentEmail: string;
};

export function AccountEmailForm({ currentEmail }: AccountEmailFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(changeAccountEmailAction, initialFormState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="account-settings-form account-settings-subform">
      <div className="account-settings-subsection">
        <div className="account-settings-subsection-copy">
          <h3>Change Email</h3>
          <p>Future sign-ins will use the new email address after you save this change.</p>
        </div>
      </div>

      <div className="account-settings-input-grid">
        <div className="field account-settings-field">
          <label htmlFor="accountNewEmail">New Email</label>
          <div className="account-settings-input-shell">
            <span className="account-settings-input-icon" aria-hidden="true">
              <MailIcon />
            </span>
            <input
              id="accountNewEmail"
              name="newEmail"
              type="email"
              defaultValue=""
              placeholder={currentEmail}
              autoComplete="email"
            />
          </div>
          {state.fieldErrors?.newEmail?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field account-settings-field">
          <label htmlFor="accountConfirmNewEmail">Confirm New Email</label>
          <div className="account-settings-input-shell">
            <span className="account-settings-input-icon" aria-hidden="true">
              <MailIcon />
            </span>
            <input
              id="accountConfirmNewEmail"
              name="confirmNewEmail"
              type="email"
              defaultValue=""
              autoComplete="email"
            />
          </div>
          {state.fieldErrors?.confirmNewEmail?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>
      </div>

      <div className="field account-settings-field">
        <label htmlFor="accountEmailCurrentPassword">Current Password</label>
        <div className="account-settings-input-shell">
          <span className="account-settings-input-icon" aria-hidden="true">
            <LockIcon />
          </span>
          <input
            id="accountEmailCurrentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
        </div>
        {state.fieldErrors?.currentPassword?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row account-settings-button-row">
        <SubmitButton className="account-settings-secondary-button is-compact">Update Email</SubmitButton>
      </div>
    </form>
  );
}
