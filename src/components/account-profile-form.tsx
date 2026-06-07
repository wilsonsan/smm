"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateAccountProfileAction } from "@/app/dashboard/account/actions";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/validation";

type AccountProfileFormProps = {
  username: string;
  email: string;
};

export function AccountProfileForm({ username, email }: AccountProfileFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateAccountProfileAction, initialFormState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="form-grid">
      <div className="grid-2">
        <div className="field">
          <label htmlFor="accountUsername">Username</label>
          <input id="accountUsername" name="username" defaultValue={username} />
          {state.fieldErrors?.username?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>

        <div className="field">
          <label htmlFor="accountEmail">Email Address</label>
          <input id="accountEmail" name="email" type="email" defaultValue={email} />
          {state.fieldErrors?.email?.map((error) => (
            <span key={error} className="error-text">
              {error}
            </span>
          ))}
        </div>
      </div>

      {state.message ? <p className={state.success ? "success-text" : "error-text"}>{state.message}</p> : null}

      <div className="button-row">
        <SubmitButton className="primary-button">Save Profile</SubmitButton>
      </div>
    </form>
  );
}
