export type RateLimitScope = "ip" | "user" | "organization" | "email";

export type RateLimitDefinition = {
  name: string;
  scope: RateLimitScope;
  limit: number;
  windowMs: number;
  message: string;
  actionLabel: string;
};

export type RateLimitLeaseDefinition = RateLimitDefinition & {
  concurrentLimit: number;
  leaseTtlMs: number;
};

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export const RATE_LIMITS = {
  authentication: {
    loginFailed: {
      name: "authentication.loginFailed",
      scope: "ip",
      limit: 5,
      windowMs: 5 * minute,
      message: "Too many sign-in attempts. Please wait a moment and try again.",
      actionLabel: "login_failed",
    } satisfies RateLimitDefinition,
    passwordResetByEmail: {
      name: "authentication.passwordResetByEmail",
      scope: "email",
      limit: 3,
      windowMs: hour,
      message: "Too many password reset requests. Please wait a moment and try again.",
      actionLabel: "password_reset",
    } satisfies RateLimitDefinition,
    passwordResetByIp: {
      name: "authentication.passwordResetByIp",
      scope: "ip",
      limit: 10,
      windowMs: hour,
      message: "Too many password reset requests. Please wait a moment and try again.",
      actionLabel: "password_reset",
    } satisfies RateLimitDefinition,
    mfaVerification: {
      name: "authentication.mfaVerification",
      scope: "user",
      limit: 10,
      windowMs: 10 * minute,
      message: "Too many verification attempts. Please wait a moment and try again.",
      actionLabel: "mfa_verification",
    } satisfies RateLimitDefinition,
  },
  api: {
    defaultAuthenticated: {
      name: "api.defaultAuthenticated",
      scope: "user",
      limit: 100,
      windowMs: minute,
      message: "Too many requests. Please wait a moment and try again.",
      actionLabel: "authenticated_api",
    } satisfies RateLimitDefinition,
    galleryBrowsing: {
      name: "api.galleryBrowsing",
      scope: "user",
      limit: 500,
      windowMs: minute,
      message: "Too many gallery requests. Please wait a moment and try again.",
      actionLabel: "gallery_browse",
    } satisfies RateLimitDefinition,
    dashboard: {
      name: "api.dashboard",
      scope: "user",
      limit: 300,
      windowMs: minute,
      message: "Too many dashboard requests. Please wait a moment and try again.",
      actionLabel: "dashboard_view",
    } satisfies RateLimitDefinition,
    settings: {
      name: "api.settings",
      scope: "user",
      limit: 60,
      windowMs: minute,
      message: "Too many settings requests. Please wait a moment and try again.",
      actionLabel: "settings_view",
    } satisfies RateLimitDefinition,
    exports: {
      name: "api.exports",
      scope: "user",
      limit: 10,
      windowMs: hour,
      message: "Too many export requests. Please wait a moment and try again.",
      actionLabel: "export_report",
    } satisfies RateLimitDefinition,
  },
  uploads: {
    imageUpload: {
      name: "uploads.imageUpload",
      scope: "user",
      limit: 20,
      windowMs: minute,
      message: "Too many uploads. Please wait a moment and try again.",
      actionLabel: "media_upload",
    } satisfies RateLimitDefinition,
    uploadConcurrency: {
      name: "uploads.uploadConcurrency",
      scope: "user",
      limit: 20,
      windowMs: minute,
      concurrentLimit: 4,
      leaseTtlMs: 2 * minute,
      message: "Too many uploads are already in progress. Please wait a moment and try again.",
      actionLabel: "media_upload_concurrent",
    } satisfies RateLimitLeaseDefinition,
  },
  publishing: {
    perUserHourly: {
      name: "publishing.perUserHourly",
      scope: "user",
      limit: 30,
      windowMs: hour,
      message: "Publishing limit reached. Please try again later.",
      actionLabel: "publish_post",
    } satisfies RateLimitDefinition,
    perOrganizationDaily: {
      name: "publishing.perOrganizationDaily",
      scope: "organization",
      limit: 100,
      windowMs: day,
      message: "Publishing limit reached. Please try again later.",
      actionLabel: "publish_post",
    } satisfies RateLimitDefinition,
  },
  scheduling: {
    perUserDaily: {
      name: "scheduling.perUserDaily",
      scope: "user",
      limit: 100,
      windowMs: day,
      message: "Scheduling limit reached. Please try again later.",
      actionLabel: "schedule_post",
    } satisfies RateLimitDefinition,
  },
  connectedAccounts: {
    actionsPerHour: {
      name: "connectedAccounts.actionsPerHour",
      scope: "user",
      limit: 10,
      windowMs: hour,
      message: "Too many connected account requests. Please wait a moment and try again.",
      actionLabel: "connected_account_action",
    } satisfies RateLimitDefinition,
  },
  admin: {
    actionsPerHour: {
      name: "admin.actionsPerHour",
      scope: "user",
      limit: 20,
      windowMs: hour,
      message: "Too many admin actions. Please wait a moment and try again.",
      actionLabel: "admin_action",
    } satisfies RateLimitDefinition,
  },
} as const;

export function formatRateLimitWindow(windowMs: number) {
  if (windowMs % day === 0) {
    const days = windowMs / day;
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  if (windowMs % hour === 0) {
    const hours = windowMs / hour;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const minutes = Math.max(1, Math.round(windowMs / minute));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
