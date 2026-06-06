"use client";

import { useMemo, useState } from "react";
import type { FacebookOauthDebugResult } from "@/lib/facebook";

type FacebookDiagnosticsPanelProps = {
  debugResult: FacebookOauthDebugResult;
  manualResolvedPage: {
    pageId: string;
    pageName: string;
  } | null;
  timezone: string;
  onClearAction: (formData: FormData) => void;
  onRunPageIdDiagnosticsAction: (formData: FormData) => void;
  onConnectResolvedPageAction: (formData: FormData) => void;
};

function formatDiagnosticJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatLocalDate(value: string | null, timezone: string) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildKeyFindings(debugResult: FacebookOauthDebugResult, manualResolvedPage: FacebookDiagnosticsPanelProps["manualResolvedPage"]) {
  const findings = [
    `OAuth user: ${debugResult.profile.name} (${debugResult.profile.id})`,
    `Granted scopes: ${debugResult.grantedScopes.join(", ") || "None"}`,
    `/me/accounts returned ${debugResult.diagnostics.rawAccountsCount} row(s) with ${debugResult.diagnostics.rawAccountsWithPageAccessTokenCount} page token row(s).`,
  ];

  if (manualResolvedPage) {
    findings.push(
      `Direct Page lookup succeeded for ${manualResolvedPage.pageName} (${manualResolvedPage.pageId}). This app can use the Page even though /me/accounts is empty.`,
    );
  } else if (debugResult.businessDiagnostics.businesses.length > 0) {
    findings.push(
      `Business fallback returned ${debugResult.businessDiagnostics.businesses.length} business row(s). This Page may need Business Manager discovery.`,
    );
  } else {
    findings.push("No direct Page fallback is currently resolved from the saved diagnostics snapshot.");
  }

  return findings;
}

function buildCopyPayload(
  debugResult: FacebookOauthDebugResult,
  manualResolvedPage: FacebookDiagnosticsPanelProps["manualResolvedPage"],
) {
  const keyFindings = buildKeyFindings(debugResult, manualResolvedPage);

  return [
    "Facebook Diagnostics",
    `Run: ${debugResult.fetchedAt}`,
    `Graph API version: ${debugResult.graphApiVersion}`,
    `Redirect URI: ${debugResult.redirectUri}`,
    `User: ${debugResult.profile.name} (${debugResult.profile.id})`,
    `Requested scopes: ${debugResult.requestedScopes.join(", ") || "None"}`,
    `Granted scopes: ${debugResult.grantedScopes.join(", ") || "None"}`,
    `Missing required scopes: ${debugResult.missingRequiredScopes.join(", ") || "None"}`,
    `Accounts source: ${debugResult.diagnostics.accountsSource}`,
    `Raw account rows: ${debugResult.diagnostics.rawAccountsCount}`,
    `Raw rows with tokens: ${debugResult.diagnostics.rawAccountsWithPageAccessTokenCount}`,
    `Hydrated page tokens: ${debugResult.diagnostics.hydratedPageAccessTokenCount}`,
    `Summary: ${debugResult.summaryMessage}`,
    "",
    "Key Findings:",
    ...keyFindings.map((finding) => `- ${finding}`),
    "",
    "Token Debug:",
    ...debugResult.tokenDebug.map((entry) =>
      [
        `- ${entry.tokenSource}`,
        `  app_id: ${entry.appId || "Unavailable"}`,
        `  user_id: ${entry.userId || "Unavailable"}`,
        `  is_valid: ${entry.isValid === null ? "Unknown" : entry.isValid ? "true" : "false"}`,
        `  expires_at: ${entry.expiresAt || "Not returned"}`,
        `  scopes: ${entry.scopes.join(", ") || "None"}`,
        entry.errorMessage ? `  error: ${entry.errorMessage}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "",
    "Core Endpoint Results:",
    ...debugResult.endpointResults.map((result) =>
      [
        `- ${result.endpoint}`,
        `  token source: ${result.tokenSource}`,
        `  http status: ${result.httpStatus ?? "Unknown"}`,
        `  success: ${result.success ? "true" : "false"}`,
        `  data count: ${result.dataCount ?? "n/a"}`,
        formatDiagnosticJson(result.sanitizedJson),
      ].join("\n"),
    ),
    "",
    "Business Fallback Results:",
    ...debugResult.businessDiagnostics.endpointResults.map((result) =>
      [
        `- ${result.endpoint}`,
        `  token source: ${result.tokenSource}`,
        `  http status: ${result.httpStatus ?? "Unknown"}`,
        `  success: ${result.success ? "true" : "false"}`,
        `  data count: ${result.dataCount ?? "n/a"}`,
        formatDiagnosticJson(result.sanitizedJson),
      ].join("\n"),
    ),
    "",
    "Manual Page Test:",
    debugResult.manualPageIdTest
      ? [
          `Page input: ${debugResult.manualPageIdTest.pageId}`,
          ...debugResult.manualPageIdTest.endpointResults.map((result) =>
            [
              `- ${result.endpoint}`,
              `  token source: ${result.tokenSource}`,
              `  http status: ${result.httpStatus ?? "Unknown"}`,
              `  success: ${result.success ? "true" : "false"}`,
              formatDiagnosticJson(result.sanitizedJson),
            ].join("\n"),
          ),
        ].join("\n")
      : "No manual Page test run.",
  ].join("\n");
}

function getNextStep(debugResult: FacebookOauthDebugResult, manualResolvedPage: FacebookDiagnosticsPanelProps["manualResolvedPage"]) {
  if (manualResolvedPage) {
    return `Direct page lookup succeeded for ${manualResolvedPage.pageName}. Use the connect button below to attach that Page even though /me/accounts is empty.`;
  }

  if (debugResult.missingRequiredScopes.length > 0) {
    return `Reconnect Facebook and approve the missing scopes: ${debugResult.missingRequiredScopes.join(", ")}.`;
  }

  if (debugResult.businessDiagnostics.businesses.length > 0) {
    return "This Meta app can see Business Manager data but not standard /me/accounts rows. Add business_management to the connect flow or keep using the business fallback.";
  }

  return "Most useful items to share are the summary message, accounts source, raw account counts, and the failing or succeeding endpoint cards below.";
}

export function FacebookDiagnosticsPanel({
  debugResult,
  manualResolvedPage,
  timezone,
  onClearAction,
  onRunPageIdDiagnosticsAction,
  onConnectResolvedPageAction,
}: FacebookDiagnosticsPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const keyFindings = useMemo(() => buildKeyFindings(debugResult, manualResolvedPage), [debugResult, manualResolvedPage]);
  const copyPayload = useMemo(() => buildCopyPayload(debugResult, manualResolvedPage), [debugResult, manualResolvedPage]);
  const nextStep = useMemo(() => getNextStep(debugResult, manualResolvedPage), [debugResult, manualResolvedPage]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyPayload);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2500);
    }
  }

  return (
    <div className="facebook-diagnostics-shell">
      <div className="facebook-diagnostics-toolbar">
        <div className="facebook-diagnostics-toolbar-copy">
          <strong>Last run: {formatLocalDate(debugResult.fetchedAt, timezone)}</strong>
          <span>{debugResult.summaryMessage}</span>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={handleCopy}>
            {copyState === "copied" ? "Copied Diagnostics" : copyState === "failed" ? "Copy Failed" : "Copy All Diagnostics"}
          </button>
          <form action={onClearAction}>
            <button type="submit" className="ghost-link-button">
              Clear Diagnostics Snapshot
            </button>
          </form>
        </div>
      </div>

      <div className="facebook-diagnostics-summary-grid">
        <article className="facebook-diagnostics-summary-card">
          <span className="facebook-diagnostics-summary-label">User</span>
          <strong>{debugResult.profile.name}</strong>
          <span>{debugResult.profile.id}</span>
        </article>
        <article className="facebook-diagnostics-summary-card">
          <span className="facebook-diagnostics-summary-label">Token flow</span>
          <strong>{debugResult.tokenInfo.longLivedExchangeStatus === "success" ? "Long-lived token ready" : "Short-lived only"}</strong>
          <span>Source: {debugResult.diagnostics.accountsSource}</span>
        </article>
        <article className="facebook-diagnostics-summary-card">
          <span className="facebook-diagnostics-summary-label">Page discovery</span>
          <strong>{debugResult.diagnostics.rawAccountsCount} account rows</strong>
          <span>{debugResult.diagnostics.rawAccountsWithPageAccessTokenCount} rows with page tokens</span>
        </article>
        <article className="facebook-diagnostics-summary-card">
          <span className="facebook-diagnostics-summary-label">Best next step</span>
          <strong>{manualResolvedPage ? "Direct connect available" : "Review endpoint sections"}</strong>
          <span>{manualResolvedPage ? manualResolvedPage.pageName : "Use the sections below"}</span>
        </article>
      </div>

      <div className="facebook-diagnostics-callout">
        <strong>What to send back</strong>
        <p>{nextStep}</p>
      </div>

      <details className="facebook-diagnostics-section" open>
        <summary>Key findings</summary>
        <div className="facebook-diagnostics-section-body">
          <div className="settings-subcard-list">
            {keyFindings.map((finding, index) => (
              <div key={`${finding}-${index}`} className="settings-nav-card">
                <p>{finding}</p>
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="facebook-diagnostics-section" open>
        <summary>Top-line answers</summary>
        <div className="facebook-diagnostics-section-body">
          <div className="settings-subcard-list">
            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Scopes</strong>
              </div>
              <p>Requested: {debugResult.requestedScopes.join(", ") || "None"}</p>
              <p>Granted: {debugResult.grantedScopes.join(", ") || "None"}</p>
              <p>Missing required: {debugResult.missingRequiredScopes.join(", ") || "None"}</p>
            </div>
            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Account discovery</strong>
              </div>
              <p>Accounts source: {debugResult.diagnostics.accountsSource}</p>
              <p>Raw account rows: {debugResult.diagnostics.rawAccountsCount}</p>
              <p>Rows with tokens: {debugResult.diagnostics.rawAccountsWithPageAccessTokenCount}</p>
              <p>Hydrated page tokens: {debugResult.diagnostics.hydratedPageAccessTokenCount}</p>
            </div>
            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Manual page result</strong>
              </div>
              {manualResolvedPage ? (
                <>
                  <p>Resolved page: {manualResolvedPage.pageName}</p>
                  <p>Resolved page ID: {manualResolvedPage.pageId}</p>
                </>
              ) : (
                <p>No direct page lookup is currently available from the manual test.</p>
              )}
            </div>
          </div>
        </div>
      </details>

      <details className="facebook-diagnostics-section">
        <summary>Token debug</summary>
        <div className="facebook-diagnostics-section-body">
          <div className="settings-subcard-list">
            {debugResult.tokenDebug.map((entry) => (
              <div key={entry.tokenSource} className="settings-nav-card">
                <div className="settings-nav-card-head">
                  <strong>{entry.tokenSource}</strong>
                  <span className={`badge is-${entry.isValid ? "published" : entry.isValid === false ? "failed" : "draft"}`.trim()}>
                    {entry.isValid === null ? "Unknown" : entry.isValid ? "Valid" : "Invalid"}
                  </span>
                </div>
                <p>App ID: {entry.appId || "Unavailable"}</p>
                <p>User ID: {entry.userId || "Unavailable"}</p>
                <p>Expires: {entry.expiresAt ? formatLocalDate(entry.expiresAt, timezone) : "Not returned"}</p>
                <p>Scopes: {entry.scopes.join(", ") || "None returned"}</p>
                {entry.errorMessage ? <p className="error-text">{entry.errorMessage}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="facebook-diagnostics-section">
        <summary>Core endpoint results</summary>
        <div className="facebook-diagnostics-section-body">
          <div className="settings-subcard-list">
            {debugResult.endpointResults.map((result, index) => (
              <div key={`${result.endpoint}-${result.tokenSource}-${index}`} className="settings-nav-card">
                <div className="settings-nav-card-head">
                  <strong>{result.endpoint}</strong>
                  <span className={`badge is-${result.success ? "published" : "failed"}`.trim()}>
                    {result.success ? "Success" : "Failed"}
                  </span>
                </div>
                <p>Token source: {result.tokenSource}</p>
                <p>HTTP status: {result.httpStatus ?? "Unknown"}</p>
                <p>Data count: {result.dataCount ?? "n/a"}</p>
                {result.parsedAccounts?.length ? (
                  <div className="facebook-diagnostics-mini-table">
                    {result.parsedAccounts.map((account) => (
                      <div key={`${result.endpoint}-${result.tokenSource}-${account.id}`} className="facebook-diagnostics-mini-row">
                        <strong>{account.name}</strong>
                        <span>ID: {account.id}</span>
                        <span>Token: {account.hasPageAccessToken ? "Present" : "Missing"}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <pre className="settings-code-block">{formatDiagnosticJson(result.sanitizedJson)}</pre>
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="facebook-diagnostics-section">
        <summary>Business Manager fallback</summary>
        <div className="facebook-diagnostics-section-body">
          <div className="settings-subcard-list">
            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Fallback summary</strong>
              </div>
              <p>Businesses returned: {debugResult.businessDiagnostics.businesses.length}</p>
              <p>Optional scope: {debugResult.optionalDiagnosticScopes.join(", ")}</p>
            </div>
            {debugResult.businessDiagnostics.endpointResults.map((result, index) => (
              <div key={`${result.endpoint}-${result.tokenSource}-business-${index}`} className="settings-nav-card">
                <div className="settings-nav-card-head">
                  <strong>{result.endpoint}</strong>
                  <span className={`badge is-${result.success ? "published" : "failed"}`.trim()}>
                    {result.success ? "Success" : "Failed"}
                  </span>
                </div>
                <p>Token source: {result.tokenSource}</p>
                <p>HTTP status: {result.httpStatus ?? "Unknown"}</p>
                <p>Data count: {result.dataCount ?? "n/a"}</p>
                <pre className="settings-code-block">{formatDiagnosticJson(result.sanitizedJson)}</pre>
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="facebook-diagnostics-section" open>
        <summary>Manual Page ID test</summary>
        <div className="facebook-diagnostics-section-body">
          <div className="settings-nav-card">
            <div className="settings-nav-card-head">
              <strong>Test a known Page ID or username</strong>
            </div>
            <p>Use a page username like `nctilepro` when you do not yet know the numeric page ID.</p>
            <form action={onRunPageIdDiagnosticsAction} className="form-grid">
              <div className="field">
                <label htmlFor="debugPageId">Test Page ID</label>
                <input id="debugPageId" name="pageId" defaultValue={debugResult.manualPageIdTest?.pageId || ""} placeholder="Enter a Page ID or username" />
              </div>
              <div className="button-row">
                <button type="submit" className="secondary-button">
                  Run Page ID Test
                </button>
              </div>
            </form>
            {manualResolvedPage ? (
              <div className="button-row">
                <form action={onConnectResolvedPageAction}>
                  <input type="hidden" name="pageId" value={manualResolvedPage.pageId} />
                  <button type="submit" className="primary-button">
                    Connect {manualResolvedPage.pageName}
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          {debugResult.manualPageIdTest ? (
            <div className="settings-subcard-list">
              {debugResult.manualPageIdTest.endpointResults.map((result, index) => (
                <div key={`${result.endpoint}-${result.tokenSource}-manual-${index}`} className="settings-nav-card">
                  <div className="settings-nav-card-head">
                    <strong>{result.endpoint}</strong>
                    <span className={`badge is-${result.success ? "published" : "failed"}`.trim()}>
                      {result.success ? "Success" : "Failed"}
                    </span>
                  </div>
                  <p>Token source: {result.tokenSource}</p>
                  <p>HTTP status: {result.httpStatus ?? "Unknown"}</p>
                  <pre className="settings-code-block">{formatDiagnosticJson(result.sanitizedJson)}</pre>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
