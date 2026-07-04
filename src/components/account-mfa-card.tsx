"use client";

import { useActionState, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { initialAccountMfaFormState } from "@/app/dashboard/account/form-state";
import {
  disableMfaAction,
  regenerateMfaRecoveryCodesAction,
  startMfaSetupAction,
  verifyMfaSetupAction,
} from "@/app/dashboard/account/actions";
import { LockIcon, ShieldIcon } from "@/components/dashboard-icons";
import { SubmitButton } from "@/components/submit-button";

type AccountMfaCardProps = {
  isEnabled: boolean;
  enabledAtLabel: string | null;
  hasPendingSetup: boolean;
  qrCodeDataUrl: string | null;
  manualKey: string | null;
};

export function AccountMfaCard({
  isEnabled,
  enabledAtLabel,
  hasPendingSetup,
  qrCodeDataUrl,
  manualKey,
}: AccountMfaCardProps) {
  const router = useRouter();
  const [localRecoveryCodes, setLocalRecoveryCodes] = useState<string[]>([]);
  const [showDisablePanel, setShowDisablePanel] = useState(false);
  const [showRecoveryPanel, setShowRecoveryPanel] = useState(false);

  const [startState, startAction] = useActionState(startMfaSetupAction, initialAccountMfaFormState);
  const [verifyState, verifyAction] = useActionState(verifyMfaSetupAction, initialAccountMfaFormState);
  const [recoveryState, recoveryAction] = useActionState(regenerateMfaRecoveryCodesAction, initialAccountMfaFormState);
  const [disableState, disableAction] = useActionState(disableMfaAction, initialAccountMfaFormState);

  useEffect(() => {
    if (startState.success) {
      router.refresh();
    }
  }, [router, startState.success]);

  useEffect(() => {
    if (verifyState.success && verifyState.recoveryCodes?.length) {
      setLocalRecoveryCodes(verifyState.recoveryCodes);
      setShowDisablePanel(false);
      setShowRecoveryPanel(false);
      router.refresh();
    }
  }, [router, verifyState.recoveryCodes, verifyState.success]);

  useEffect(() => {
    if (recoveryState.success && recoveryState.recoveryCodes?.length) {
      setLocalRecoveryCodes(recoveryState.recoveryCodes);
      setShowRecoveryPanel(true);
      router.refresh();
    }
  }, [recoveryState.recoveryCodes, recoveryState.success, router]);

  useEffect(() => {
    if (disableState.success) {
      setLocalRecoveryCodes([]);
      setShowDisablePanel(false);
      setShowRecoveryPanel(false);
      router.refresh();
    }
  }, [disableState.success, router]);

  const effectiveEnabled = isEnabled || verifyState.success;
  const setupVisible = !effectiveEnabled && hasPendingSetup;
  const recoveryCodesToShow = localRecoveryCodes.length > 0 ? localRecoveryCodes : [];

  return (
    <div className="account-mfa-card-shell is-enabled">
      <div className="account-mfa-card-head">
        <div className="account-mfa-card-title-block">
          <div className="account-settings-card-icon">
            <LockIcon />
          </div>
          <div>
            <div className="account-mfa-card-title-row">
              <h3>Two-Factor Authentication (MFA)</h3>
              <span className="account-mfa-recommended-badge">{effectiveEnabled ? "Enabled" : "Recommended"}</span>
            </div>
            <p>Add an extra layer of security with a standard authenticator app and one-time recovery codes.</p>
          </div>
        </div>
      </div>

      {!effectiveEnabled && !setupVisible ? (
        <div className="account-mfa-empty-state">
          <div className="account-mfa-empty-copy">
            <strong>MFA is currently off</strong>
            <p>Enable MFA to require a 6-digit authenticator code after your password when signing in.</p>
          </div>
          <form action={startAction} className="account-mfa-inline-form">
            <SubmitButton className="account-settings-primary-button">Enable MFA</SubmitButton>
          </form>
          {startState.message ? (
            <p className={startState.success ? "success-text" : "error-text"}>{startState.message}</p>
          ) : null}
        </div>
      ) : null}

      {setupVisible ? (
        <>
          <div className="account-mfa-body">
            <ol className="account-mfa-steps">
              <li>
                <span className="account-mfa-step-index">1</span>
                <div>
                  <strong>Install an authenticator app</strong>
                  <p>Google Authenticator, 1Password, Authy, and Microsoft Authenticator all work.</p>
                </div>
              </li>
              <li>
                <span className="account-mfa-step-index">2</span>
                <div>
                  <strong>Scan the QR code</strong>
                  <p>Use the app to scan the QR code, or copy the manual setup key if you prefer.</p>
                </div>
              </li>
              <li>
                <span className="account-mfa-step-index">3</span>
                <div>
                  <strong>Verify the 6-digit code</strong>
                  <p>MFA is only enabled after the current code from your authenticator app verifies successfully.</p>
                </div>
              </li>
            </ol>

            <div className="account-mfa-qr-panel">
              <div className="account-mfa-qr-frame">
                {qrCodeDataUrl ? (
                  <Image
                    src={qrCodeDataUrl}
                    alt="QR code for authenticator app setup"
                    className="account-mfa-qr-image"
                    width={138}
                    height={138}
                    unoptimized
                  />
                ) : (
                  <div className="account-mfa-qr-placeholder">
                    <ShieldIcon />
                  </div>
                )}
              </div>

              {manualKey ? (
                <div className="account-mfa-manual-key">
                  <code>{manualKey}</code>
                </div>
              ) : null}

              <p className="account-mfa-manual-copy">Can&apos;t scan? Enter the code above manually in your authenticator app.</p>
            </div>
          </div>

          <form action={verifyAction} className="account-settings-form">
            <div className="account-mfa-verification-row">
              <div className="field account-settings-field">
                <label htmlFor="accountMfaCode">Enter 6-digit code</label>
                <div className="account-settings-input-shell">
                  <span className="account-settings-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    id="accountMfaCode"
                    name="verificationCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                  />
                </div>
                {verifyState.fieldErrors?.verificationCode?.map((error) => (
                  <span key={error} className="error-text">
                    {error}
                  </span>
                ))}
              </div>

              <SubmitButton className="account-settings-primary-button account-mfa-submit">Verify &amp; Enable</SubmitButton>
            </div>

            {verifyState.message ? (
              <p className={verifyState.success ? "success-text" : "error-text"}>{verifyState.message}</p>
            ) : null}
          </form>
        </>
      ) : null}

      {effectiveEnabled ? (
        <div className="account-mfa-enabled-stack">
          <div className="account-mfa-status-card">
            <div>
              <strong>MFA is enabled</strong>
              <p>{enabledAtLabel ? `Enabled on ${enabledAtLabel}.` : "This account requires MFA when signing in."}</p>
            </div>
            <span className="account-mfa-status-pill">Protected</span>
          </div>

          <div className="account-mfa-actions-row">
            <button
              type="button"
              className="account-settings-secondary-button"
              onClick={() => {
                setShowRecoveryPanel((current) => !current);
                setShowDisablePanel(false);
              }}
            >
              Regenerate Recovery Codes
            </button>
            <button
              type="button"
              className="account-settings-destructive-button"
              onClick={() => {
                setShowDisablePanel((current) => !current);
                setShowRecoveryPanel(false);
              }}
            >
              Disable MFA
            </button>
          </div>

          {showRecoveryPanel ? (
            <form action={recoveryAction} className="account-settings-form account-settings-subform">
              <div className="account-settings-subsection">
                <div className="account-settings-subsection-copy">
                  <h3>Regenerate Recovery Codes</h3>
                  <p>Confirm with your current password and a fresh MFA or recovery code. Existing recovery codes will stop working.</p>
                </div>
              </div>

              <div className="account-settings-input-grid">
                <div className="field account-settings-field">
                  <label htmlFor="recoveryCurrentPassword">Current Password</label>
                  <div className="account-settings-input-shell">
                    <span className="account-settings-input-icon" aria-hidden="true">
                      <LockIcon />
                    </span>
                    <input id="recoveryCurrentPassword" name="currentPassword" type="password" autoComplete="current-password" />
                  </div>
                  {recoveryState.fieldErrors?.currentPassword?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                </div>

                <div className="field account-settings-field">
                  <label htmlFor="recoveryVerificationCode">Authenticator or Recovery Code</label>
                  <div className="account-settings-input-shell">
                    <span className="account-settings-input-icon" aria-hidden="true">
                      <LockIcon />
                    </span>
                    <input
                      id="recoveryVerificationCode"
                      name="verificationCode"
                      autoComplete="one-time-code"
                      placeholder="123456 or ABCD-EFGH"
                    />
                  </div>
                  {recoveryState.fieldErrors?.verificationCode?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                </div>
              </div>

              {recoveryState.message ? (
                <p className={recoveryState.success ? "success-text" : "error-text"}>{recoveryState.message}</p>
              ) : null}

              <div className="button-row account-settings-button-row">
                <SubmitButton className="account-settings-primary-button is-compact">Generate New Codes</SubmitButton>
              </div>
            </form>
          ) : null}

          {showDisablePanel ? (
            <form action={disableAction} className="account-settings-form account-settings-subform">
              <div className="account-settings-subsection">
                <div className="account-settings-subsection-copy">
                  <h3>Disable MFA</h3>
                  <p>Confirm with your current password and a valid MFA or recovery code before MFA is removed.</p>
                </div>
              </div>

              <div className="account-settings-input-grid">
                <div className="field account-settings-field">
                  <label htmlFor="disableMfaCurrentPassword">Current Password</label>
                  <div className="account-settings-input-shell">
                    <span className="account-settings-input-icon" aria-hidden="true">
                      <LockIcon />
                    </span>
                    <input
                      id="disableMfaCurrentPassword"
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                    />
                  </div>
                  {disableState.fieldErrors?.currentPassword?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                </div>

                <div className="field account-settings-field">
                  <label htmlFor="disableMfaVerificationCode">Authenticator or Recovery Code</label>
                  <div className="account-settings-input-shell">
                    <span className="account-settings-input-icon" aria-hidden="true">
                      <LockIcon />
                    </span>
                    <input
                      id="disableMfaVerificationCode"
                      name="verificationCode"
                      autoComplete="one-time-code"
                      placeholder="123456 or ABCD-EFGH"
                    />
                  </div>
                  {disableState.fieldErrors?.verificationCode?.map((error) => (
                    <span key={error} className="error-text">
                      {error}
                    </span>
                  ))}
                </div>
              </div>

              {disableState.message ? (
                <p className={disableState.success ? "success-text" : "error-text"}>{disableState.message}</p>
              ) : null}

              <div className="button-row account-settings-button-row">
                <SubmitButton className="account-settings-destructive-button is-compact">Disable MFA</SubmitButton>
              </div>
            </form>
          ) : null}

          {recoveryCodesToShow.length > 0 ? (
            <div className="account-mfa-recovery-panel">
              <div className="account-settings-subsection-copy">
                <h3>Recovery Codes</h3>
                <p>Save these now. Each code can only be used once, and they will not be shown again after you leave this page.</p>
              </div>
              <div className="account-mfa-recovery-grid">
                {recoveryCodesToShow.map((recoveryCode) => (
                  <code key={recoveryCode}>{recoveryCode}</code>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
