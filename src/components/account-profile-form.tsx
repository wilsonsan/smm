"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateAccountProfileAction } from "@/app/dashboard/account/actions";
import { CalendarIcon, MailIcon, UserIcon } from "@/components/dashboard-icons";
import { RoleBadge } from "@/components/role-badge";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

type AccountProfileFormProps = {
  username: string;
  email: string;
  role: "ADMIN" | "CREATOR";
  createdAtLabel: string;
};

export function AccountProfileForm({ username, email, role, createdAtLabel }: AccountProfileFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateAccountProfileAction, initialFormState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="account-settings-form">
      <div className="account-settings-input-grid">
        <div className="field account-settings-field">
          <label htmlFor="accountUsername">Username</label>
          <div className="account-settings-input-shell">
            <span className="account-settings-input-icon" aria-hidden="true">
              <UserIcon />
            </span>
            <input id="accountUsername" name="username" defaultValue={username} />
          </div>
          {state.fieldErrors?.username?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field account-settings-field">
          <label htmlFor="accountCurrentEmail">Current Email</label>
          <div className="account-settings-input-shell is-readonly">
            <span className="account-settings-input-icon" aria-hidden="true">
              <MailIcon />
            </span>
            <input id="accountCurrentEmail" value={email} readOnly aria-readonly="true" tabIndex={-1} />
          </div>
        </div>
      </div>

      <div className="account-settings-info-panel account-settings-profile-info-panel">
        <div className="account-settings-info-row">
          <div className="account-settings-info-label">
            <span className="account-settings-info-icon" aria-hidden="true">
              <UserIcon />
            </span>
            <span>Role</span>
          </div>
          <RoleBadge role={role} />
        </div>

        <div className="account-settings-info-row">
          <div className="account-settings-info-label">
            <span className="account-settings-info-icon" aria-hidden="true">
              <CalendarIcon />
            </span>
            <span>Account Created</span>
          </div>
          <strong>{createdAtLabel}</strong>
        </div>
      </div>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row account-settings-button-row">
        <SubmitButton className="account-settings-primary-button is-compact">Save Changes</SubmitButton>
      </div>
    </form>
  );
}
