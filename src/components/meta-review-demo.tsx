"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import {
  ArrowRightIcon,
  ClockIcon,
  ComposeIcon,
  InfoIcon,
  InstagramIcon,
  LogoSparkIcon,
  SettingsIcon,
  ShieldIcon,
  SuccessIcon,
  UserIcon,
} from "@/components/dashboard-icons";

type MetaReviewDemoProps = {
  siteName: string;
  account: {
    pageName: string;
    username: string;
    profilePictureUrl: string | null;
    status: string;
    isReady: boolean;
    missingScopes: string[];
  };
};

type DemoTarget =
  | "connected-account"
  | "platform-selection"
  | "caption-field"
  | "first-comment-field"
  | "publish-button"
  | "status-timeline"
  | "success-notification"
  | "verification-card"
  | "completion-card";

type ScriptSegment = {
  stepIndex: number;
  target: DemoTarget;
  durationMs: number;
  subtitle: string;
  publishStage: "idle" | "publishing" | "commenting" | "complete";
};

const REVIEW_STEPS = [
  {
    title: "Connected Instagram Account",
    description: "Confirm the business account that will publish the Instagram post in the recording.",
  },
  {
    title: "Create Instagram Post",
    description: "Select Instagram and show the caption that will be sent through the Instagram Graph API.",
  },
  {
    title: "Enter First Comment",
    description: "Reveal the optional First Comment field and populate it with the exact text the business wants posted.",
  },
  {
    title: "Publish Post",
    description: "Publish the Instagram post and show the app initiating the post creation request first.",
  },
  {
    title: "Verify First Comment",
    description: "Show that the app creates only the user-provided First Comment immediately after the post succeeds.",
  },
  {
    title: "Completion",
    description: "Close with a clear confirmation that the permission is not used to manage other users' comments.",
  },
] as const;

const SCRIPT_SEGMENTS: ScriptSegment[] = [
  {
    stepIndex: 0,
    target: "connected-account",
    durationMs: 12000,
    subtitle: "This application allows businesses to create and publish Instagram posts from one workflow.",
    publishStage: "idle",
  },
  {
    stepIndex: 0,
    target: "connected-account",
    durationMs: 9000,
    subtitle: "The connected Instagram Business account is confirmed before publishing begins.",
    publishStage: "idle",
  },
  {
    stepIndex: 1,
    target: "platform-selection",
    durationMs: 11000,
    subtitle: "The user creates an Instagram post and selects Instagram as the publishing destination.",
    publishStage: "idle",
  },
  {
    stepIndex: 1,
    target: "caption-field",
    durationMs: 11000,
    subtitle: "The caption keeps the main message clean and focused on the business update.",
    publishStage: "idle",
  },
  {
    stepIndex: 2,
    target: "first-comment-field",
    durationMs: 12000,
    subtitle: "The user enters an optional First Comment.",
    publishStage: "idle",
  },
  {
    stepIndex: 2,
    target: "first-comment-field",
    durationMs: 10000,
    subtitle: "Many businesses place hashtags in the First Comment to keep captions clean.",
    publishStage: "idle",
  },
  {
    stepIndex: 3,
    target: "publish-button",
    durationMs: 12000,
    subtitle: "When Publish is clicked, the Instagram post is created through the Instagram Graph API.",
    publishStage: "publishing",
  },
  {
    stepIndex: 4,
    target: "status-timeline",
    durationMs: 12000,
    subtitle:
      "After the post is successfully published, the application automatically creates the First Comment using the instagram_manage_comments permission.",
    publishStage: "commenting",
  },
  {
    stepIndex: 4,
    target: "success-notification",
    durationMs: 10000,
    subtitle: "The application only creates the user-provided First Comment.",
    publishStage: "complete",
  },
  {
    stepIndex: 4,
    target: "verification-card",
    durationMs: 10000,
    subtitle:
      "It does not read, moderate, hide, delete, or respond to comments from other Instagram users.",
    publishStage: "complete",
  },
  {
    stepIndex: 5,
    target: "completion-card",
    durationMs: 12000,
    subtitle: "The review demonstration is now complete.",
    publishStage: "complete",
  },
];

const DEMO_CAPTION =
  "Fresh showroom install with warm stone tones, clean grout lines, and a polished finish ready for this week's customer feature.";
const DEMO_FIRST_COMMENT = "#ShowroomRefresh #TileDesign #InteriorInspiration";

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M8 5.4v13.2c0 .8.9 1.2 1.5.7l8.4-6.6a.9.9 0 0 0 0-1.4L9.5 4.7A.9.9 0 0 0 8 5.4Z" />
    </svg>
  );
}

function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <rect x="6.5" y="5" width="4.5" height="14" rx="1.2" />
      <rect x="13" y="5" width="4.5" height="14" rx="1.2" />
    </svg>
  );
}

function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 11a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function VideoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3.5" y="6.5" width="12" height="11" rx="2.6" />
      <path d="m15.5 10 5-2.8v9.6l-5-2.8" />
    </svg>
  );
}

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5.2 17.7 4 20.5l3.1-1.5h9.1a3.1 3.1 0 0 0 3.1-3.1V8.7a3.1 3.1 0 0 0-3.1-3.1H7.1A3.1 3.1 0 0 0 4 8.7v6a3.1 3.1 0 0 0 1.2 3Z" />
    </svg>
  );
}

function formatDurationLabel(totalMs: number) {
  const totalSeconds = Math.round(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getAccountInitials(pageName: string) {
  return pageName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase() ?? "")
    .join("");
}

export function MetaReviewDemo({ siteName, account }: MetaReviewDemoProps) {
  const [recordingMode, setRecordingMode] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const totalRuntime = useMemo(
    () => SCRIPT_SEGMENTS.reduce((total, segment) => total + segment.durationMs, 0),
    [],
  );

  useEffect(() => {
    if (!isRunning || segmentIndex < 0) {
      return;
    }

    const isLastSegment = segmentIndex >= SCRIPT_SEGMENTS.length - 1;
    const timeout = window.setTimeout(() => {
      if (isLastSegment) {
        setIsRunning(false);
        return;
      }

      setSegmentIndex((current) => current + 1);
    }, SCRIPT_SEGMENTS[segmentIndex].durationMs);

    return () => window.clearTimeout(timeout);
  }, [isRunning, segmentIndex]);

  const activeSegment = segmentIndex >= 0 ? SCRIPT_SEGMENTS[segmentIndex] : null;
  const activeStepIndex = activeSegment?.stepIndex ?? -1;
  const hasStarted = segmentIndex >= 0;
  const selectedInstagram = activeStepIndex >= 1;
  const showCaption = activeStepIndex >= 1;
  const showFirstComment = activeStepIndex >= 2;
  const showStatusTimeline = activeStepIndex >= 3;
  const showSuccessNotification = segmentIndex >= 8;
  const showVerificationCard = activeStepIndex >= 4;
  const showCompletionCard = activeStepIndex >= 5;
  const activePublishStage = activeSegment?.publishStage ?? "idle";

  const progressPercent = hasStarted
    ? Math.min(((segmentIndex + (isRunning ? 0.5 : 1)) / SCRIPT_SEGMENTS.length) * 100, 100)
    : 0;

  function handleStartReview() {
    setSegmentIndex(0);
    setIsRunning(true);
  }

  function handleTogglePlayback() {
    if (!hasStarted) {
      handleStartReview();
      return;
    }

    setIsRunning((current) => !current);
  }

  function handleRestart() {
    setSegmentIndex(0);
    setIsRunning(false);
  }

  function isTargetActive(target: DemoTarget) {
    return activeSegment?.target === target;
  }

  return (
    <div className={`meta-review-demo-shell${recordingMode ? " is-recording" : ""}`.trim()}>
      <div className="meta-review-demo-backdrop" aria-hidden="true" />

      <header className="meta-review-demo-header">
        <div className="meta-review-demo-header-copy">
          <div className="meta-review-demo-brand">
            <span className="meta-review-demo-brand-mark" aria-hidden="true">
              <LogoSparkIcon />
            </span>
            <span>{siteName}</span>
          </div>
          <h1>Meta Review Demo</h1>
          <p>
            A clean recording experience for demonstrating that <code>instagram_manage_comments</code> is used only
            to publish an optional First Comment immediately after an Instagram post succeeds.
          </p>
        </div>

        <div className="meta-review-demo-toolbar">
          <Link href="/dashboard/settings/channels/instagram" className="ghost-link-button meta-review-demo-toolbar-link">
            <SettingsIcon />
            <span>Instagram Settings</span>
          </Link>

          <button
            type="button"
            className={`meta-review-toggle${recordingMode ? " is-active" : ""}`.trim()}
            onClick={() => setRecordingMode((current) => !current)}
            aria-pressed={recordingMode}
          >
            <VideoIcon />
            <span>Recording Mode</span>
          </button>

          <button type="button" className="primary-button meta-review-action-button" onClick={handleStartReview}>
            <PlayIcon />
            <span>{hasStarted ? "Start From Beginning" : "Start Review"}</span>
          </button>

          <button type="button" className="secondary-button meta-review-action-button" onClick={handleTogglePlayback}>
            {isRunning ? <PauseIcon /> : <PlayIcon />}
            <span>{isRunning ? "Pause" : hasStarted ? "Resume" : "Start"}</span>
          </button>

          <button type="button" className="secondary-button meta-review-action-button" onClick={handleRestart}>
            <RefreshIcon />
            <span>Restart</span>
          </button>
        </div>
      </header>

      <div className="meta-review-demo-layout">
        <aside className="meta-review-demo-sidebar">
          <section className="panel meta-review-step-card">
            <div className="panel-body">
              <div className="meta-review-step-card-head">
                <div>
                  <span className="settings-eyebrow">Walkthrough</span>
                  <h2>Review Flow</h2>
                </div>
                <span className="badge is-draft">{formatDurationLabel(totalRuntime)}</span>
              </div>

              <div className="meta-review-step-list">
                {REVIEW_STEPS.map((step, index) => {
                  const status =
                    activeStepIndex > index || (index === REVIEW_STEPS.length - 1 && showCompletionCard)
                      ? "done"
                      : activeStepIndex === index
                        ? "current"
                        : "pending";

                  return (
                    <article
                      key={step.title}
                      className={`meta-review-step-item is-${status}`.trim()}
                      aria-current={status === "current" ? "step" : undefined}
                    >
                      <span className="meta-review-step-number">{index + 1}</span>
                      <div className="meta-review-step-copy">
                        <strong>{step.title}</strong>
                        <p>{step.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel meta-review-note-card">
            <div className="panel-body">
              <div className="meta-review-note-head">
                <InfoIcon />
                <strong>Reviewer Notes</strong>
              </div>
              <p>The demo stays inside one polished view so the recording can be completed without spoken narration.</p>
              <p>
                Recording Mode removes extra navigation and keeps attention on the Instagram selection, caption,
                First Comment, publish action, and completion proof.
              </p>
            </div>
          </section>

          {!account.isReady ? (
            <section className="panel meta-review-warning-card">
              <div className="panel-body">
                <div className="meta-review-note-head">
                  <ShieldIcon />
                  <strong>Connection Attention</strong>
                </div>
                <p>The connected Instagram account is not fully ready yet. The demo still renders, but live app review recording should be done after setup is green.</p>
                {account.missingScopes.length > 0 ? (
                  <p className="meta-review-warning-copy">Missing permissions: {account.missingScopes.join(", ")}</p>
                ) : null}
              </div>
            </section>
          ) : null}
        </aside>

        <main className="meta-review-demo-stage">
          <section className="panel meta-review-recording-stage">
            <div className="panel-body meta-review-recording-stage-body">
              <div className="meta-review-stage-topbar">
                <div>
                  <span className="settings-eyebrow">Meta App Review Submission</span>
                  <h2>instagram_manage_comments</h2>
                </div>
                <div className="meta-review-stage-status">
                  <span className={`badge is-${account.isReady ? "published" : "failed"}`.trim()}>{account.status}</span>
                  <span className="meta-review-stage-runtime">{formatDurationLabel(totalRuntime)} guided review</span>
                </div>
              </div>

              <div className="meta-review-progress">
                <div className="meta-review-progress-bar" aria-hidden="true">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <span>{hasStarted ? `Segment ${segmentIndex + 1} of ${SCRIPT_SEGMENTS.length}` : "Ready to record"}</span>
              </div>

              <div className="meta-review-stage-grid">
                <section
                  className={`meta-review-account-card${isTargetActive("connected-account") ? " is-highlighted" : ""}`.trim()}
                  data-demo-target="connected-account"
                >
                  <div className="meta-review-account-head">
                    <div className="meta-review-account-avatar">
                      {account.profilePictureUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={account.profilePictureUrl} alt={`${account.pageName} profile`} />
                      ) : (
                        <span>{getAccountInitials(account.pageName) || <UserIcon />}</span>
                      )}
                    </div>
                    <div className="meta-review-account-copy">
                      <strong>{account.pageName}</strong>
                      <span>@{account.username}</span>
                    </div>
                    <span className={`badge is-${account.isReady ? "published" : "draft"}`.trim()}>
                      {account.isReady ? "Connected" : "Needs Setup"}
                    </span>
                  </div>

                  <div className="meta-review-account-meta">
                    <span>
                      <ShieldIcon />
                      <span>Instagram Business publishing connection</span>
                    </span>
                    <span>
                      <CommentIcon />
                      <span>Optional First Comment enabled after publish</span>
                    </span>
                  </div>
                </section>

                <div className="meta-review-composer-and-preview">
                  <section className="meta-review-composer-card">
                    <div className="meta-review-card-head">
                      <div>
                        <span className="settings-eyebrow">Composer</span>
                        <h3>Create Instagram Post</h3>
                      </div>
                      <span className="meta-review-card-label">
                        <ComposeIcon />
                        <span>Production Workflow</span>
                      </span>
                    </div>

                    <div className="meta-review-composer-section">
                      <div className="meta-review-section-heading">
                        <span className="meta-review-step-pill">1</span>
                        <div>
                          <strong>Select platform</strong>
                          <p>Instagram is selected before any First Comment is created.</p>
                        </div>
                      </div>

                      <div
                        className={`meta-review-platform-row${isTargetActive("platform-selection") ? " is-highlighted" : ""}`.trim()}
                        data-demo-target="platform-selection"
                      >
                        <button type="button" className="meta-review-platform-button">
                          <span className="meta-review-platform-icon is-muted" />
                          <span>Facebook</span>
                        </button>
                        <button
                          type="button"
                          className={`meta-review-platform-button is-instagram${selectedInstagram ? " is-selected" : ""}`.trim()}
                        >
                          <InstagramIcon />
                          <span>Instagram</span>
                        </button>
                        <button type="button" className="meta-review-platform-button">
                          <span className="meta-review-platform-icon is-google" />
                          <span>Google</span>
                        </button>
                      </div>
                    </div>

                    <div className="meta-review-composer-section">
                      <div className="meta-review-section-heading">
                        <span className="meta-review-step-pill">2</span>
                        <div>
                          <strong>Caption</strong>
                          <p>The post caption is prepared before publishing.</p>
                        </div>
                      </div>

                      <div
                        className={`meta-review-input-card${isTargetActive("caption-field") ? " is-highlighted" : ""}`.trim()}
                        data-demo-target="caption-field"
                      >
                        <label htmlFor="metaReviewCaption">Caption</label>
                        <textarea
                          id="metaReviewCaption"
                          value={showCaption ? DEMO_CAPTION : ""}
                          readOnly
                          rows={5}
                        />
                        <div className="meta-review-input-footer">
                          <span>Main Instagram post body</span>
                          <span>{showCaption ? `${DEMO_CAPTION.length} / 2,200` : "0 / 2,200"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="meta-review-composer-section">
                      <div className="meta-review-section-heading">
                        <span className="meta-review-step-pill">3</span>
                        <div>
                          <strong>Optional First Comment</strong>
                          <p>Used for hashtags or extra notes after the post already exists.</p>
                        </div>
                      </div>

                      <div
                        className={`meta-review-input-card${isTargetActive("first-comment-field") ? " is-highlighted" : ""}`.trim()}
                        data-demo-target="first-comment-field"
                      >
                        <label htmlFor="metaReviewFirstComment">Instagram First Comment</label>
                        <textarea
                          id="metaReviewFirstComment"
                          value={showFirstComment ? DEMO_FIRST_COMMENT : ""}
                          readOnly
                          rows={3}
                        />
                        <div className="meta-review-input-footer">
                          <span>Only submitted if the user provides a value</span>
                          <span>{showFirstComment ? `${DEMO_FIRST_COMMENT.length} / 2,200` : "0 / 2,200"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="meta-review-composer-actions">
                      <button
                        type="button"
                        className={`meta-review-publish-button${isTargetActive("publish-button") ? " is-highlighted" : ""}`.trim()}
                        data-demo-target="publish-button"
                      >
                        <PlayIcon />
                        <span>{activePublishStage === "publishing" ? "Publishing..." : "Publish Post"}</span>
                      </button>
                    </div>

                    {showSuccessNotification ? (
                      <div
                        className={`meta-review-success-toast${isTargetActive("success-notification") ? " is-highlighted" : ""}`.trim()}
                        data-demo-target="success-notification"
                      >
                        <SuccessIcon />
                        <div>
                          <strong>Instagram post published successfully</strong>
                          <p>The First Comment was created immediately after the post succeeded.</p>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="meta-review-preview-column">
                    <section
                      className={`meta-review-status-card${showStatusTimeline ? " is-visible" : ""}${isTargetActive("status-timeline") ? " is-highlighted" : ""}`.trim()}
                      data-demo-target="status-timeline"
                    >
                      <div className="meta-review-card-head">
                        <div>
                          <span className="settings-eyebrow">Status Timeline</span>
                          <h3>Publishing Progress</h3>
                        </div>
                        <ClockIcon />
                      </div>

                      <div className="meta-review-status-list">
                        <div className={`meta-review-status-item ${activePublishStage === "publishing" ? "is-active" : showStatusTimeline ? "is-complete" : ""}`.trim()}>
                          <span className="meta-review-status-marker" />
                          <div>
                            <strong>Publishing Instagram Post</strong>
                            <p>Create the Instagram media container and publish the post first.</p>
                          </div>
                        </div>
                        <div className={`meta-review-status-item ${activePublishStage === "commenting" ? "is-active" : activePublishStage === "complete" ? "is-complete" : ""}`.trim()}>
                          <span className="meta-review-status-marker" />
                          <div>
                            <strong>Creating First Comment</strong>
                            <p>Submit only the user-provided First Comment after the post succeeds.</p>
                          </div>
                        </div>
                        <div className={`meta-review-status-item ${activePublishStage === "complete" ? "is-complete" : ""}`.trim()}>
                          <span className="meta-review-status-marker" />
                          <div>
                            <strong>Completed Successfully</strong>
                            <p>The post and the optional First Comment are both confirmed.</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section
                      className={`meta-review-verification-card${showVerificationCard ? " is-visible" : ""}${isTargetActive("verification-card") ? " is-highlighted" : ""}`.trim()}
                      data-demo-target="verification-card"
                    >
                      <div className="meta-review-card-head">
                        <div>
                          <span className="settings-eyebrow">Verification</span>
                          <h3>Published Instagram Result</h3>
                        </div>
                        <InstagramIcon />
                      </div>

                      <div className="meta-review-instagram-proof">
                        <div className="meta-review-proof-head">
                          <div className="meta-review-proof-avatar">
                            {account.profilePictureUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={account.profilePictureUrl} alt={`${account.pageName} avatar`} />
                            ) : (
                              <span>{getAccountInitials(account.pageName)}</span>
                            )}
                          </div>
                          <div>
                            <strong>{account.username}</strong>
                            <span>Just now</span>
                          </div>
                        </div>

                        <div className="meta-review-proof-media" aria-hidden="true">
                          <div className="meta-review-proof-tile meta-review-proof-tile--one" />
                          <div className="meta-review-proof-tile meta-review-proof-tile--two" />
                          <div className="meta-review-proof-tile meta-review-proof-tile--three" />
                        </div>

                        <div className="meta-review-proof-body">
                          <p>
                            <strong>{account.username}</strong> {DEMO_CAPTION}
                          </p>
                          {showVerificationCard ? (
                            <div className="meta-review-proof-comment">
                              <span>First Comment</span>
                              <p>{DEMO_FIRST_COMMENT}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </section>

                    {showCompletionCard ? (
                      <section
                        className={`meta-review-completion-card${isTargetActive("completion-card") ? " is-highlighted" : ""}`.trim()}
                        data-demo-target="completion-card"
                      >
                        <div className="meta-review-card-head">
                          <div>
                            <span className="settings-eyebrow">Completion</span>
                            <h3>Permission Scope Demonstrated</h3>
                          </div>
                          <SuccessIcon />
                        </div>

                        <div className="meta-review-completion-points">
                          <p>
                            <SuccessIcon />
                            <span>The app publishes an Instagram post first.</span>
                          </p>
                          <p>
                            <SuccessIcon />
                            <span>The app then creates only the user-provided optional First Comment.</span>
                          </p>
                          <p>
                            <SuccessIcon />
                            <span>No comment moderation, hiding, deletion, reading, or reply actions are performed.</span>
                          </p>
                        </div>
                      </section>
                    ) : null}
                  </section>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {activeSegment ? (
        <div className="meta-review-subtitle-layer" aria-live="polite">
          <div key={segmentIndex} className="meta-review-subtitle-card">
            <span className="meta-review-subtitle-label">On-screen narration</span>
            <p>{activeSegment.subtitle}</p>
          </div>
        </div>
      ) : null}

      {!recordingMode ? (
        <footer className="meta-review-demo-footer">
          <span>Designed for a 2 to 3 minute silent app review recording.</span>
          <Link href="/dashboard/settings/channels/instagram">
            Return to Instagram Settings
            <ArrowRightIcon />
          </Link>
        </footer>
      ) : null}
    </div>
  );
}
