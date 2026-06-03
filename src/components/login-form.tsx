"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/login/actions";
import { initialFormState } from "@/lib/validation";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialFormState);

  return (
    <form action={formAction} className="form-grid">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        {state.fieldErrors?.email?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {state.fieldErrors?.password?.map((error) => (
          <span key={error} className="error-text">
            {error}
          </span>
        ))}
      </div>

      {state.message ? <p className="error-text">{state.message}</p> : null}

      <SubmitButton className="primary-button">Sign In</SubmitButton>
    </form>
  );
}

