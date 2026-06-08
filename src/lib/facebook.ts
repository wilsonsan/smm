import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cookies } from "next/headers";
import {
  ConnectedAccountStatus,
  NotificationType,
  Prisma,
  PublishAttemptStatus,
  SocialPlatform,
  SocialPostStatus,
  type ConnectedAccount,
} from "@prisma/client";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { env, hasTokenEncryptionKeyConfigured, isProduction } from "@/lib/env";
import {
  FACEBOOK_SETTINGS_ACTION_URL,
  createOrUpdateFacebookTokenNotification,
  dismissProviderNotifications,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  APP_SETTING_KEYS,
  getAppSettingValue,
  getAppSettings,
  upsertAppSetting,
} from "@/lib/settings";
import { getFacebookAppSecretSetting } from "@/lib/secure-settings";
import {
  cleanupTemporaryPlatformImage,
  generateTemporaryPlatformImage,
  validateStoredMediaFile,
  validateStoredOriginalMediaAsset,
} from "@/lib/uploads";

export const FACEBOOK_GRAPH_VERSION = "v23.0";
export const FACEBOOK_REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;

export const FACEBOOK_OAUTH_STATE_COOKIE_NAME = "smm_facebook_oauth_state";
export const FACEBOOK_OAUTH_MODE_COOKIE_NAME = "smm_facebook_oauth_mode";
export const FACEBOOK_PENDING_SELECTION_COOKIE_NAME = "smm_facebook_pending_selection";
export const FACEBOOK_OAUTH_DEBUG_COOKIE_NAME = "smm_facebook_oauth_debug";
export const FACEBOOK_OAUTH_DEBUG_TOKENS_COOKIE_NAME = "smm_facebook_oauth_debug_tokens";
const FACEBOOK_STATE_MAX_AGE_SECONDS = 10 * 60;
const FACEBOOK_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const FACEBOOK_DEBUG_TOKENS_MAX_AGE_SECONDS = 30 * 60;
const FACEBOOK_OPTIONAL_DIAGNOSTIC_SCOPES = ["business_management"] as const;
const INSTAGRAM_FOUNDATION_SCOPES = ["instagram_basic", "instagram_content_publish"] as const;

export type FacebookOauthMode = "connect" | "reconnect" | "debug";

export type FacebookRuntimeCheck = {
  key: string;
  label: string;
  configured: boolean;
  detail: string;
};

type FacebookApiErrorPayload = {
  error?: {
    code?: number;
    error_subcode?: number;
    message?: string;
    type?: string;
    fbtrace_id?: string;
  };
};

type FacebookManagedPage = {
  id: string;
  name: string;
  accessToken: string;
  link?: string | null;
  tasks?: string[];
};

type FacebookRawPageAccount = {
  id: string;
  name: string;
  accessToken: string | null;
  link?: string | null;
  tasks?: string[];
};

type PendingFacebookPageSelection = {
  accountId: string;
  accountName: string;
  pages: FacebookManagedPage[];
  scopes: string[];
  tokenExpiresAt: string | null;
  mode: Exclude<FacebookOauthMode, "debug">;
};

export type FacebookOauthDebugResult = {
  profile: {
    id: string;
    name: string;
  };
  permissions: Array<{
    permission: string;
    status: string;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    tasks: string[];
    hasPageAccessToken: boolean;
  }>;
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  emptyAccountsMessage: string | null;
  diagnostics: {
    accountsSource: "long_lived" | "short_lived";
    rawAccountsCount: number;
    rawAccountsWithPageAccessTokenCount: number;
    hydratedPageAccessTokenCount: number;
    usedShortLivedFallback: boolean;
  };
  graphApiVersion: string;
  redirectUri: string;
  requestedScopes: string[];
  missingRequiredScopes: string[];
  optionalDiagnosticScopes: string[];
  tokenInfo: {
    shortLivedExists: boolean;
    longLivedExists: boolean;
    longLivedExchangeStatus: "success" | "failure";
  };
  tokenDebug: Array<{
    tokenSource: "short_lived_user" | "long_lived_user";
    appId: string | null;
    userId: string | null;
    isValid: boolean | null;
    expiresAt: string | null;
    scopes: string[];
    errorMessage: string | null;
    errorType: string | null;
    errorCode: number | null;
    errorSubcode: number | null;
    fbtraceId: string | null;
  }>;
  endpointResults: Array<{
    endpoint: string;
    tokenSource: "short_lived_user" | "long_lived_user";
    httpStatus: number | null;
    success: boolean;
    dataCount: number | null;
    sanitizedJson: Prisma.JsonValue;
    parsedAccounts?: Array<{
      id: string;
      name: string;
      tasks: string[];
      category: string | null;
      verificationStatus: string | null;
      hasPageAccessToken: boolean;
    }>;
  }>;
  businessDiagnostics: {
    businesses: Array<{
      id: string;
      name: string;
    }>;
    endpointResults: Array<{
      endpoint: string;
      tokenSource: "short_lived_user" | "long_lived_user";
      httpStatus: number | null;
      success: boolean;
      dataCount: number | null;
      sanitizedJson: Prisma.JsonValue;
      parsedAccounts?: Array<{
        id: string;
        name: string;
        tasks: string[];
        category: string | null;
        verificationStatus: string | null;
        hasPageAccessToken: boolean;
      }>;
    }>;
  };
  manualPageIdTest: {
    pageId: string | null;
    endpointResults: Array<{
      endpoint: string;
      tokenSource: "short_lived_user" | "long_lived_user";
      httpStatus: number | null;
      success: boolean;
      dataCount: number | null;
      sanitizedJson: Prisma.JsonValue;
    }>;
  } | null;
  summaryMessage: string;
  fetchedAt: string;
};

type ResolvedFacebookOauthSession = {
  profile: {
    id: string;
    name: string;
  };
  permissions: Array<{
    permission: string;
    status: string;
  }>;
  accounts: FacebookRawPageAccount[];
  grantedScopes: string[];
  tokenExpiresAt: Date | null;
  diagnostics: FacebookOauthDebugResult["diagnostics"];
  tokens: {
    shortLivedAccessToken: string;
    longLivedAccessToken: string | null;
    longLivedExchangeStatus: "success" | "failure";
  };
};

type FacebookDebugTokenBundle = {
  shortLivedAccessToken: string;
  longLivedAccessToken: string | null;
  redirectUri: string;
  requestedScopes: string[];
  grantedScopes: string[];
  fetchedAt: string;
};

type FacebookDiagnosticRequestResult = FacebookOauthDebugResult["endpointResults"][number];

export type FacebookConnectionRecord = {
  id: string;
  platform: SocialPlatform;
  accountName: string;
  accountId: string | null;
  pageId: string | null;
  pageName: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  status: ConnectedAccountStatus;
  lastTestedAt: Date | null;
  lastSuccessfulTestAt: Date | null;
  lastFailedTestAt: Date | null;
  lastError: string | null;
  metadata: ConnectedAccount["metadata"];
  createdAt: Date;
  updatedAt: Date;
};

export type FacebookConnection = FacebookConnectionRecord & {
  accessToken: string;
};

export type FacebookConfiguration = {
  appId: string;
  appSecretConfigured: boolean;
  appSecretSource: "settings" | "environment" | "missing";
  redirectUri: string;
  requiredScopes: string[];
  optionalDiagnosticScopes: string[];
  missingConfig: string[];
  publicAppUrl: string;
  preferredPageLookupValue: string;
  checks: FacebookRuntimeCheck[];
};

export type FacebookConnectionTestResult = {
  pageId: string;
  pageName: string;
  pageUrl: string | null;
  testedAt: Date;
};

export type FacebookConnectionHealthResult = {
  status: ConnectedAccountStatus;
  pageId: string | null;
  pageName: string | null;
  pageUrl: string | null;
  testedAt: Date | null;
  message: string | null;
  missingScopes: string[];
};

export type FacebookPreviewIdentity = {
  pageName: string | null;
  profilePictureUrl: string | null;
};

export type FacebookLinkedInstagramAccountMetadata = {
  status: "READY" | "NOT_LINKED" | "LOOKUP_ERROR";
  accountId: string | null;
  username: string | null;
  profilePictureUrl: string | null;
  source: "instagram_business_account" | "connected_instagram_account" | null;
  lastCheckedAt: string;
  errorMessage: string | null;
};

type FacebookConnectionMetadata = {
  pageUrl: string | null;
  pageProfilePictureUrl: string | null;
  instagram: FacebookLinkedInstagramAccountMetadata | null;
};

export type FacebookPublishResult = {
  platformPostId: string;
  platformPostUrl: string | null;
  responseSummary: Prisma.InputJsonValue;
};

export type FacebookPublishClaimResult =
  | {
      ok: true;
      socialPostId: string;
      socialPostPlatformId: string;
    }
  | {
      ok: false;
      reason:
        | "INVALID_STATUS"
        | "ALREADY_PUBLISHED"
        | "ALREADY_HAS_PLATFORM_POST_ID"
        | "ALREADY_RUNNING"
        | "CLAIM_CONFLICT";
      message: string;
    };

export class FacebookServiceError extends Error {
  code: string | null;
  responseSummary: Prisma.InputJsonValue | null;

  constructor(message: string, options?: { code?: string | null; responseSummary?: Prisma.InputJsonValue | null }) {
    super(message);
    this.name = "FacebookServiceError";
    this.code = options?.code ?? null;
    this.responseSummary = options?.responseSummary ?? null;
  }
}

function buildTokenEncryptionKey() {
  if (!hasTokenEncryptionKeyConfigured) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required before Facebook tokens can be stored securely.");
  }

  return createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY || "").digest();
}

function encryptValue(value: string) {
  const key = buildTokenEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptValue(value: string) {
  const key = buildTokenEncryptionKey();
  const parts = value.split(".");

  if (parts.length !== 3) {
    throw new Error("Stored encrypted token payload is invalid.");
  }

  const [ivPart, tagPart, encryptedPart] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function buildFacebookGraphUrl(pathname: string, params?: Record<string, string | number | undefined | null>) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}${normalizedPath}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

function normalizeFacebookScopes(scopes: unknown) {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes
    .map((scope) => String(scope).trim())
    .filter(Boolean);
}

function normalizeFacebookConnectionMetadata(metadata: ConnectedAccount["metadata"]): FacebookConnectionMetadata {
  const fallback: FacebookConnectionMetadata = {
    pageUrl: null,
    pageProfilePictureUrl: null,
    instagram: null,
  };

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return fallback;
  }

  const raw = metadata as Record<string, unknown>;
  const rawInstagram =
    raw.instagram && typeof raw.instagram === "object" && !Array.isArray(raw.instagram)
      ? (raw.instagram as Record<string, unknown>)
      : null;

  return {
    pageUrl: typeof raw.pageUrl === "string" && raw.pageUrl.trim().length > 0 ? raw.pageUrl : null,
    pageProfilePictureUrl:
      typeof raw.pageProfilePictureUrl === "string" && raw.pageProfilePictureUrl.trim().length > 0
        ? raw.pageProfilePictureUrl
        : null,
    instagram: rawInstagram
      ? {
          status:
            rawInstagram.status === "READY" ||
            rawInstagram.status === "NOT_LINKED" ||
            rawInstagram.status === "LOOKUP_ERROR"
              ? rawInstagram.status
              : "NOT_LINKED",
          accountId:
            typeof rawInstagram.accountId === "string" && rawInstagram.accountId.trim().length > 0
              ? rawInstagram.accountId
              : null,
          username:
            typeof rawInstagram.username === "string" && rawInstagram.username.trim().length > 0
              ? rawInstagram.username
              : null,
          profilePictureUrl:
            typeof rawInstagram.profilePictureUrl === "string" && rawInstagram.profilePictureUrl.trim().length > 0
              ? rawInstagram.profilePictureUrl
              : null,
          source:
            rawInstagram.source === "instagram_business_account" || rawInstagram.source === "connected_instagram_account"
              ? rawInstagram.source
              : null,
          lastCheckedAt:
            typeof rawInstagram.lastCheckedAt === "string" && rawInstagram.lastCheckedAt.trim().length > 0
              ? rawInstagram.lastCheckedAt
              : new Date(0).toISOString(),
          errorMessage:
            typeof rawInstagram.errorMessage === "string" && rawInstagram.errorMessage.trim().length > 0
              ? rawInstagram.errorMessage
              : null,
        }
      : null,
  };
}

function buildFacebookConnectionMetadata(input: {
  existingMetadata?: ConnectedAccount["metadata"];
  pageUrl?: string | null;
  pageProfilePictureUrl?: string | null;
  instagram?: FacebookLinkedInstagramAccountMetadata | null;
}) {
  const existing = normalizeFacebookConnectionMetadata(input.existingMetadata ?? null);
  const next: FacebookConnectionMetadata = {
    pageUrl: input.pageUrl !== undefined ? input.pageUrl : existing.pageUrl,
    pageProfilePictureUrl:
      input.pageProfilePictureUrl !== undefined ? input.pageProfilePictureUrl : existing.pageProfilePictureUrl,
    instagram: input.instagram !== undefined ? input.instagram : existing.instagram,
  };

  if (!next.pageUrl && !next.pageProfilePictureUrl && !next.instagram) {
    return Prisma.JsonNull;
  }

  return {
    ...(next.pageUrl ? { pageUrl: next.pageUrl } : {}),
    ...(next.pageProfilePictureUrl ? { pageProfilePictureUrl: next.pageProfilePictureUrl } : {}),
    ...(next.instagram ? { instagram: next.instagram } : {}),
  } satisfies Prisma.InputJsonObject;
}

async function resolveLinkedInstagramAccount(input: {
  pageId: string;
  accessToken: string;
}): Promise<FacebookLinkedInstagramAccountMetadata> {
  const base = {
    accountId: null,
    username: null,
    profilePictureUrl: null,
    lastCheckedAt: new Date().toISOString(),
  } as const;

  try {
    const businessResponse = await facebookGraphRequestJson<{
      instagram_business_account?: {
        id?: string;
        username?: string;
        profile_picture_url?: string;
      } | null;
    }>(
      buildFacebookGraphUrl(`/${input.pageId}`, {
        access_token: input.accessToken,
        fields: "instagram_business_account{id,username,profile_picture_url}",
      }),
      { method: "GET" },
    );

    if (businessResponse.instagram_business_account?.id) {
      return {
        ...base,
        status: "READY",
        accountId: businessResponse.instagram_business_account.id,
        username: businessResponse.instagram_business_account.username ?? null,
        profilePictureUrl: businessResponse.instagram_business_account.profile_picture_url ?? null,
        source: "instagram_business_account",
        errorMessage: null,
      };
    }
  } catch (error) {
    const normalizedError = handleFacebookApiError(error);
    return {
      ...base,
      status: "LOOKUP_ERROR",
      source: "instagram_business_account",
      errorMessage: normalizedError.message,
    };
  }

  try {
    const connectedResponse = await facebookGraphRequestJson<{
      connected_instagram_account?: {
        id?: string;
        username?: string;
        profile_picture_url?: string;
      } | null;
    }>(
      buildFacebookGraphUrl(`/${input.pageId}`, {
        access_token: input.accessToken,
        fields: "connected_instagram_account{id,username,profile_picture_url}",
      }),
      { method: "GET" },
    );

    if (connectedResponse.connected_instagram_account?.id) {
      return {
        ...base,
        status: "READY",
        accountId: connectedResponse.connected_instagram_account.id,
        username: connectedResponse.connected_instagram_account.username ?? null,
        profilePictureUrl: connectedResponse.connected_instagram_account.profile_picture_url ?? null,
        source: "connected_instagram_account",
        errorMessage: null,
      };
    }
  } catch (error) {
    const normalizedError = handleFacebookApiError(error);
    return {
      ...base,
      status: "LOOKUP_ERROR",
      source: "connected_instagram_account",
      errorMessage: normalizedError.message,
    };
  }

  return {
    ...base,
    status: "NOT_LINKED",
    source: null,
    errorMessage: null,
  };
}

function sanitizeFacebookDiagnosticJson(value: unknown): Prisma.JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeFacebookDiagnosticJson(entry));
  }

  if (typeof value === "object") {
    const result: Prisma.JsonObject = {};

    for (const [key, entry] of Object.entries(value)) {
      if (key === "access_token" || key === "accessToken") {
        result[key] = entry ? "[REDACTED_PRESENT]" : "[MISSING]";
        continue;
      }

      result[key] = sanitizeFacebookDiagnosticJson(entry);
    }

    return result;
  }

  return String(value);
}

function parseDiagnosticAccounts(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return undefined;
  }

  return data
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      name: typeof entry.name === "string" ? entry.name : "",
      tasks: Array.isArray(entry.tasks) ? entry.tasks.map((task) => String(task)) : [],
      category: typeof entry.category === "string" ? entry.category : null,
      verificationStatus: typeof entry.verification_status === "string" ? entry.verification_status : null,
      hasPageAccessToken:
        typeof entry.access_token === "string" ? entry.access_token.trim().length > 0 : Boolean(entry.access_token),
    }))
    .filter((entry) => entry.id && entry.name);
}

function getDiagnosticDataCount(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = (value as { data?: unknown }).data;
  return Array.isArray(data) ? data.length : null;
}

export async function getFacebookConfiguration(): Promise<FacebookConfiguration> {
  const settings = await getAppSettings();
  const appId = (settings.facebookAppId || env.FACEBOOK_APP_ID || "").trim();
  const appSecret = (await getFacebookAppSecretSetting()).trim();
  const appSecretSource = settings.facebookAppSecretConfigured
    ? "settings"
    : env.FACEBOOK_APP_SECRET
      ? "environment"
      : "missing";
  const publicAppUrl = settings.publicAppUrl || env.APP_URL;
  const redirectUri = new URL("/api/facebook/callback", publicAppUrl).toString();
  const missingConfig: string[] = [];
  const checks: FacebookRuntimeCheck[] = [
    {
      key: "FACEBOOK_APP_ID",
      label: "Facebook App ID",
      configured: Boolean(appId),
      detail: appId ? "Configured via env or Settings" : "Missing",
    },
    {
      key: "FACEBOOK_APP_SECRET",
      label: "Facebook App Secret",
      configured: Boolean(appSecret),
      detail:
        appSecretSource === "settings"
          ? "Configured in Settings"
          : appSecretSource === "environment"
            ? "Configured in environment"
            : "Missing",
    },
    {
      key: "TOKEN_ENCRYPTION_KEY",
      label: "Token encryption key",
      configured: hasTokenEncryptionKeyConfigured,
      detail: hasTokenEncryptionKeyConfigured ? "Configured in environment" : "Missing",
    },
    {
      key: "APP_URL",
      label: "Public app URL",
      configured: Boolean(publicAppUrl),
      detail: publicAppUrl || "Missing",
    },
    {
      key: "DATABASE_URL",
      label: "Database connection",
      configured: Boolean(env.DATABASE_URL),
      detail: env.DATABASE_URL ? "Configured" : "Missing",
    },
  ];

  if (!appId) {
    missingConfig.push("Facebook App ID");
  }

  if (!appSecret) {
    missingConfig.push("FACEBOOK_APP_SECRET");
  }

  if (!hasTokenEncryptionKeyConfigured) {
    missingConfig.push("TOKEN_ENCRYPTION_KEY");
  }

  return {
    appId,
    appSecretConfigured: Boolean(appSecret),
    appSecretSource,
    redirectUri,
    requiredScopes: [...FACEBOOK_REQUIRED_SCOPES],
    optionalDiagnosticScopes: [...FACEBOOK_OPTIONAL_DIAGNOSTIC_SCOPES],
    missingConfig,
    publicAppUrl,
    preferredPageLookupValue: settings.facebookPageLookupValue || env.FACEBOOK_PAGE_LOOKUP_VALUE || "nctilepro",
    checks,
  };
}

export async function buildConfiguredAppUrl(
  pathname: string,
  searchParams?: Record<string, string | null | undefined>,
) {
  const settings = await getAppSettings();
  const publicAppUrl = settings.publicAppUrl || env.APP_URL;
  const url = new URL(pathname, publicAppUrl);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (!value) {
      continue;
    }

    url.searchParams.set(key, value);
  }

  return url;
}

export async function assertFacebookRuntimeReady() {
  const config = await getFacebookConfiguration();

  if (config.missingConfig.length > 0) {
    throw new Error(`Facebook setup is incomplete: ${config.missingConfig.join(", ")}.`);
  }

  return config;
}

export async function buildFacebookConnectUrl(input?: { mode?: FacebookOauthMode }) {
  const config = await getFacebookConfiguration();
  const state = await createFacebookOauthState(input?.mode ?? "connect");
  const url = new URL(`https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`);
  const requestedScopes = Array.from(new Set([...config.requiredScopes, ...INSTAGRAM_FOUNDATION_SCOPES]));
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", requestedScopes.join(","));
  url.searchParams.set("response_type", "code");

  return url.toString();
}

export async function createFacebookOauthState(mode: FacebookOauthMode = "connect") {
  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(FACEBOOK_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: FACEBOOK_STATE_MAX_AGE_SECONDS,
    path: "/",
  });
  cookieStore.set(FACEBOOK_OAUTH_MODE_COOKIE_NAME, mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: FACEBOOK_STATE_MAX_AGE_SECONDS,
    path: "/",
  });

  return state;
}

export async function validateFacebookOauthState(returnedState: string | null) {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(FACEBOOK_OAUTH_STATE_COOKIE_NAME)?.value ?? "";
  cookieStore.delete(FACEBOOK_OAUTH_STATE_COOKIE_NAME);

  if (!returnedState || !storedState) {
    return false;
  }

  const returnedBuffer = Buffer.from(returnedState);
  const storedBuffer = Buffer.from(storedState);

  if (returnedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(returnedBuffer, storedBuffer);
}

export async function consumeFacebookOauthMode(): Promise<FacebookOauthMode> {
  const cookieStore = await cookies();
  const mode = cookieStore.get(FACEBOOK_OAUTH_MODE_COOKIE_NAME)?.value;
  cookieStore.delete(FACEBOOK_OAUTH_MODE_COOKIE_NAME);

  if (mode === "debug" || mode === "reconnect") {
    return mode;
  }

  return "connect";
}

export async function setPendingFacebookPageSelection(payload: PendingFacebookPageSelection) {
  const cookieStore = await cookies();
  cookieStore.set(FACEBOOK_PENDING_SELECTION_COOKIE_NAME, encryptValue(JSON.stringify(payload)), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: FACEBOOK_STATE_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearPendingFacebookPageSelection() {
  const cookieStore = await cookies();
  cookieStore.delete(FACEBOOK_PENDING_SELECTION_COOKIE_NAME);
}

export async function getPendingFacebookPageSelection() {
  const cookieStore = await cookies();
  const encryptedValue = cookieStore.get(FACEBOOK_PENDING_SELECTION_COOKIE_NAME)?.value;

  if (!encryptedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(decryptValue(encryptedValue)) as PendingFacebookPageSelection;

    if (!Array.isArray(parsed.pages) || !parsed.accountName || !parsed.accountId) {
      return null;
    }

    return {
      ...parsed,
      mode: parsed.mode === "reconnect" ? "reconnect" : "connect",
    };
  } catch {
    return null;
  }
}

export async function setFacebookOauthDebugResult(payload: FacebookOauthDebugResult) {
  await upsertAppSetting(APP_SETTING_KEYS.FACEBOOK_DIAGNOSTIC_SNAPSHOT, JSON.stringify(payload));
}

export async function clearFacebookOauthDebugResult() {
  await upsertAppSetting(APP_SETTING_KEYS.FACEBOOK_DIAGNOSTIC_SNAPSHOT, "");
  const cookieStore = await cookies();
  cookieStore.delete(FACEBOOK_OAUTH_DEBUG_TOKENS_COOKIE_NAME);
}

export async function getFacebookOauthDebugResult() {
  const storedValue = await getAppSettingValue(APP_SETTING_KEYS.FACEBOOK_DIAGNOSTIC_SNAPSHOT);

  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as FacebookOauthDebugResult;

    if (!parsed.profile?.id || !parsed.profile?.name || !Array.isArray(parsed.permissions) || !Array.isArray(parsed.accounts)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function setFacebookOauthDebugTokens(payload: FacebookDebugTokenBundle) {
  const cookieStore = await cookies();
  cookieStore.set(FACEBOOK_OAUTH_DEBUG_TOKENS_COOKIE_NAME, encryptValue(JSON.stringify(payload)), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: FACEBOOK_DEBUG_TOKENS_MAX_AGE_SECONDS,
    path: "/",
  });
}

async function getFacebookOauthDebugTokens() {
  const cookieStore = await cookies();
  const encryptedValue = cookieStore.get(FACEBOOK_OAUTH_DEBUG_TOKENS_COOKIE_NAME)?.value;

  if (!encryptedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(decryptValue(encryptedValue)) as FacebookDebugTokenBundle;

    if (!parsed.shortLivedAccessToken || !Array.isArray(parsed.requestedScopes) || !Array.isArray(parsed.grantedScopes)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function exchangeCodeForUserToken(input: { code: string; redirectUri: string; appId: string }) {
  const appSecret = await getFacebookAppSecretSetting();
  const url = buildFacebookGraphUrl("/oauth/access_token", {
    client_id: input.appId,
    client_secret: appSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });

  return facebookGraphRequestJson<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(url, { method: "GET" });
}

async function exchangeForLongLivedUserToken(input: { accessToken: string; appId: string }) {
  const appSecret = await getFacebookAppSecretSetting();
  const url = buildFacebookGraphUrl("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: input.appId,
    client_secret: appSecret,
    fb_exchange_token: input.accessToken,
  });

  return facebookGraphRequestJson<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(url, { method: "GET" });
}

async function debugFacebookUserToken(input: {
  appId: string;
  inputToken: string;
  tokenSource: "short_lived_user" | "long_lived_user";
}) {
  const appSecret = await getFacebookAppSecretSetting();
  const url = buildFacebookGraphUrl("/debug_token", {
    input_token: input.inputToken,
    access_token: `${input.appId}|${appSecret}`,
  });

  try {
    const payload = await facebookGraphRequestJson<{
      data?: {
        app_id?: string;
        user_id?: string;
        is_valid?: boolean;
        expires_at?: number;
        scopes?: string[];
      };
    }>(url, { method: "GET" });

    return {
      tokenSource: input.tokenSource,
      appId: payload.data?.app_id ?? null,
      userId: payload.data?.user_id ?? null,
      isValid: typeof payload.data?.is_valid === "boolean" ? payload.data.is_valid : null,
      expiresAt:
        typeof payload.data?.expires_at === "number" && payload.data.expires_at > 0
          ? new Date(payload.data.expires_at * 1000).toISOString()
          : null,
      scopes: Array.isArray(payload.data?.scopes) ? payload.data.scopes.map((scope) => String(scope)) : [],
      errorMessage: null,
      errorType: null,
      errorCode: null,
      errorSubcode: null,
      fbtraceId: null,
    } satisfies FacebookOauthDebugResult["tokenDebug"][number];
  } catch (error) {
    const normalizedError = handleFacebookApiError(error);
    const responseSummary =
      normalizedError.responseSummary && typeof normalizedError.responseSummary === "object" && !Array.isArray(normalizedError.responseSummary)
        ? (normalizedError.responseSummary as Record<string, unknown>)
        : null;

    return {
      tokenSource: input.tokenSource,
      appId: null,
      userId: null,
      isValid: null,
      expiresAt: null,
      scopes: [],
      errorMessage: normalizedError.message,
      errorType: typeof responseSummary?.type === "string" ? responseSummary.type : null,
      errorCode: typeof responseSummary?.code === "number" ? responseSummary.code : null,
      errorSubcode:
        typeof responseSummary?.subcode === "number" ? responseSummary.subcode : null,
      fbtraceId: typeof responseSummary?.fbtraceId === "string" ? responseSummary.fbtraceId : null,
    } satisfies FacebookOauthDebugResult["tokenDebug"][number];
  }
}

async function runFacebookDiagnosticRequest(input: {
  endpoint: string;
  tokenSource: "short_lived_user" | "long_lived_user";
  accessToken: string;
  fields?: string;
}) {
  const url = buildFacebookGraphUrl(input.endpoint, {
    access_token: input.accessToken,
    fields: input.fields,
  });

  const response = await fetch(url, { method: "GET" });
  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = {
      parse_error: "UNREADABLE_JSON",
      body_preview: text.slice(0, 500),
    };
  }

  return {
    endpoint: input.fields ? `${input.endpoint}?fields=${input.fields}` : input.endpoint,
    tokenSource: input.tokenSource,
    httpStatus: response.status,
    success: response.ok && !(payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)),
    dataCount: getDiagnosticDataCount(payload),
    sanitizedJson: sanitizeFacebookDiagnosticJson(payload),
    parsedAccounts: parseDiagnosticAccounts(payload),
  } satisfies FacebookDiagnosticRequestResult;
}

async function fetchFacebookUserProfile(userAccessToken: string) {
  const url = buildFacebookGraphUrl("/me", {
    access_token: userAccessToken,
    fields: "id,name",
  });

  return facebookGraphRequestJson<{
    id: string;
    name: string;
  }>(url, { method: "GET" });
}

async function fetchFacebookAccounts(userAccessToken: string) {
  // /me/accounts is the standard Facebook Page discovery endpoint when pages_show_list is granted.
  // Some Business Manager or New Pages Experience setups still return zero Pages here even when the user
  // can work with the Page elsewhere, which is why we also run business/assigned-page diagnostics below.
  const url = buildFacebookGraphUrl("/me/accounts", {
    access_token: userAccessToken,
    fields: "id,name,access_token,link,tasks",
  });

  const response = await facebookGraphRequestJson<{
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      link?: string;
      tasks?: string[];
    }>;
  }>(url, { method: "GET" });

  return (response.data ?? [])
    .filter((page) => page.id && page.name)
    .map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token ?? null,
      link: page.link ?? null,
      tasks: page.tasks ?? [],
    })) satisfies FacebookRawPageAccount[];
}

async function fetchFacebookPageAccessToken(input: {
  pageId: string;
  userAccessToken: string;
}) {
  const url = buildFacebookGraphUrl(`/${input.pageId}`, {
    access_token: input.userAccessToken,
    fields: "id,name,access_token,link",
  });

  return facebookGraphRequestJson<{
    id: string;
    name?: string;
    access_token?: string;
    link?: string;
  }>(url, { method: "GET" });
}

async function resolveFacebookPageWithTokenSources(input: {
  pageLookupValue: string;
  tokenSources: Array<{
    tokenSource: "short_lived_user" | "long_lived_user";
    accessToken: string;
  }>;
  grantedScopes: string[];
}) {
  let lastError: Error | null = null;

  for (const token of input.tokenSources) {
    try {
      const page = await facebookGraphRequestJson<{
        id: string;
        name: string;
        access_token?: string;
        link?: string;
      }>(
        buildFacebookGraphUrl(`/${input.pageLookupValue}`, {
          access_token: token.accessToken,
          fields: "id,name,access_token,link",
        }),
        {
          method: "GET",
        },
      );

      if (!page.access_token) {
        continue;
      }

      return {
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        pageUrl: page.link ?? null,
        tokenSource: token.tokenSource,
        grantedScopes: input.grantedScopes,
      };
    } catch (error) {
      lastError = handleFacebookApiError(error);
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function hydrateFacebookAccountsWithPageTokens(input: {
  accounts: FacebookRawPageAccount[];
  userAccessTokens: string[];
}) {
  // Never expose Page access tokens to the client. If /me/accounts returns Page rows without access_token,
  // try to resolve them server-side with the current user tokens and only store a sanitized diagnostic snapshot.
  const hydratedAccounts: FacebookRawPageAccount[] = [];
  let hydratedPageAccessTokenCount = 0;

  for (const account of input.accounts) {
    if (account.accessToken) {
      hydratedAccounts.push(account);
      continue;
    }

    let hydratedAccount = account;

    for (const token of input.userAccessTokens) {
      try {
        const response = await fetchFacebookPageAccessToken({
          pageId: account.id,
          userAccessToken: token,
        });

        if (response.access_token) {
          hydratedAccount = {
            id: account.id,
            name: response.name || account.name,
            accessToken: response.access_token,
            link: response.link ?? account.link ?? null,
            tasks: account.tasks ?? [],
          };
          hydratedPageAccessTokenCount += 1;
          break;
        }
      } catch {
        continue;
      }
    }

    hydratedAccounts.push(hydratedAccount);
  }

  return {
    accounts: hydratedAccounts,
    hydratedPageAccessTokenCount,
  };
}

async function fetchFacebookPermissions(userAccessToken: string) {
  const url = buildFacebookGraphUrl("/me/permissions", {
    access_token: userAccessToken,
  });

  const response = await facebookGraphRequestJson<{
    data?: Array<{
      permission?: string;
      status?: string;
    }>;
  }>(url, { method: "GET" });

  return (response.data ?? [])
    .filter((entry) => entry.permission && entry.status)
    .map((entry) => ({
      permission: String(entry.permission).trim(),
      status: String(entry.status).trim(),
    }))
    .filter((entry) => entry.permission && entry.status);
}

function getGrantedFacebookPermissions(
  permissions: Array<{
    permission: string;
    status: string;
  }>,
) {
  return permissions
    .filter((entry) => entry.permission && entry.status === "granted")
    .map((entry) => entry.permission)
    .filter(Boolean);
}

async function resolveFacebookOauthSession(input: { code: string }): Promise<ResolvedFacebookOauthSession> {
  const config = await getFacebookConfiguration();
  const shortLivedToken = await exchangeCodeForUserToken({
    code: input.code,
    redirectUri: config.redirectUri,
    appId: config.appId,
  });
  let longLivedToken: {
    access_token: string;
    token_type?: string;
    expires_in?: number;
  } | null = null;
  let longLivedExchangeStatus: "success" | "failure" = "failure";

  try {
    longLivedToken = await exchangeForLongLivedUserToken({
      accessToken: shortLivedToken.access_token,
      appId: config.appId,
    });
    longLivedExchangeStatus = "success";
  } catch {
    longLivedToken = null;
  }

  const primaryAccessToken = longLivedToken?.access_token || shortLivedToken.access_token;
  const [profile, permissions, primaryAccounts] = await Promise.all([
    fetchFacebookUserProfile(primaryAccessToken),
    fetchFacebookPermissions(primaryAccessToken),
    fetchFacebookAccounts(primaryAccessToken),
  ]);
  const grantedScopes = getGrantedFacebookPermissions(permissions);
  let accountsSource: "long_lived" | "short_lived" = "long_lived";
  let usedShortLivedFallback = false;
  let resolvedAccounts = primaryAccounts;

  if (!longLivedToken) {
    accountsSource = "short_lived";
  }

  if (resolvedAccounts.length === 0) {
    try {
      const shortLivedAccounts = await fetchFacebookAccounts(shortLivedToken.access_token);

      if (shortLivedAccounts.length > 0) {
        resolvedAccounts = shortLivedAccounts;
        accountsSource = "short_lived";
        usedShortLivedFallback = true;
      }
    } catch {
      usedShortLivedFallback = true;
    }
  }

  const rawAccountsWithPageAccessTokenCount = resolvedAccounts.filter((account) => Boolean(account.accessToken)).length;
  const hydrationResult = await hydrateFacebookAccountsWithPageTokens({
    accounts: resolvedAccounts,
    userAccessTokens: [longLivedToken?.access_token, shortLivedToken.access_token].filter(Boolean) as string[],
  });

  return {
    profile,
    permissions,
    accounts: hydrationResult.accounts,
    grantedScopes,
    tokenExpiresAt: longLivedToken?.expires_in
      ? new Date(Date.now() + longLivedToken.expires_in * 1000)
      : null,
    diagnostics: {
      accountsSource,
      rawAccountsCount: resolvedAccounts.length,
      rawAccountsWithPageAccessTokenCount,
      hydratedPageAccessTokenCount: hydrationResult.hydratedPageAccessTokenCount,
      usedShortLivedFallback,
    },
    tokens: {
      shortLivedAccessToken: shortLivedToken.access_token,
      longLivedAccessToken: longLivedToken?.access_token ?? null,
      longLivedExchangeStatus,
    },
  };
}

export async function getFacebookOauthCallbackData(input: { code: string }) {
  const config = await getFacebookConfiguration();
  const session = await resolveFacebookOauthSession(input);
  const pages = session.accounts
    .filter((page) => page.accessToken)
    .map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.accessToken!,
      link: page.link ?? null,
      tasks: page.tasks ?? [],
    })) satisfies FacebookManagedPage[];

  if (pages.length === 0 && config.preferredPageLookupValue) {
    const preferredPage = await resolveFacebookPageWithTokenSources({
      pageLookupValue: config.preferredPageLookupValue,
      tokenSources: [
        ...(session.tokens.longLivedAccessToken
          ? [
              {
                tokenSource: "long_lived_user" as const,
                accessToken: session.tokens.longLivedAccessToken,
              },
            ]
          : []),
        {
          tokenSource: "short_lived_user" as const,
          accessToken: session.tokens.shortLivedAccessToken,
        },
      ],
      grantedScopes: session.grantedScopes,
    });

    if (preferredPage) {
      pages.push({
        id: preferredPage.pageId,
        name: preferredPage.pageName,
        accessToken: preferredPage.pageAccessToken,
        link: preferredPage.pageUrl,
        tasks: [],
      });
    }
  }

  return {
    accountId: session.profile.id,
    accountName: session.profile.name,
    pages,
    scopes: session.grantedScopes.length > 0 ? session.grantedScopes : [...FACEBOOK_REQUIRED_SCOPES],
    tokenExpiresAt: session.tokenExpiresAt,
    diagnostics: session.diagnostics,
  };
}

async function runCoreFacebookDiagnosticRequests(input: {
  shortLivedAccessToken: string;
  longLivedAccessToken: string | null;
}) {
  const requests: Array<Promise<FacebookDiagnosticRequestResult>> = [];
  const tokenSources: Array<{
    tokenSource: "short_lived_user" | "long_lived_user";
    accessToken: string;
  }> = [
    { tokenSource: "short_lived_user", accessToken: input.shortLivedAccessToken },
  ];

  if (input.longLivedAccessToken) {
    tokenSources.push({ tokenSource: "long_lived_user", accessToken: input.longLivedAccessToken });
  }

  for (const token of tokenSources) {
    requests.push(runFacebookDiagnosticRequest({
      endpoint: "/me",
      fields: "id,name",
      tokenSource: token.tokenSource,
      accessToken: token.accessToken,
    }));
    requests.push(runFacebookDiagnosticRequest({
      endpoint: "/me/permissions",
      tokenSource: token.tokenSource,
      accessToken: token.accessToken,
    }));
    requests.push(runFacebookDiagnosticRequest({
      endpoint: "/me/accounts",
      fields: "id,name,tasks,access_token",
      tokenSource: token.tokenSource,
      accessToken: token.accessToken,
    }));
    requests.push(runFacebookDiagnosticRequest({
      endpoint: "/me/accounts",
      fields: "id,name,tasks,category,verification_status,access_token",
      tokenSource: token.tokenSource,
      accessToken: token.accessToken,
    }));
  }

  return Promise.all(requests);
}

async function runBusinessFallbackDiagnostics(input: {
  shortLivedAccessToken: string;
  longLivedAccessToken: string | null;
}) {
  // Some Page setups only become visible through Business Manager style discovery. Those fallbacks can require
  // business_management even though the basic connect flow does not, so diagnostics should capture the raw errors too.
  const tokenSources: Array<{
    tokenSource: "short_lived_user" | "long_lived_user";
    accessToken: string;
  }> = [
    { tokenSource: "short_lived_user", accessToken: input.shortLivedAccessToken },
  ];

  if (input.longLivedAccessToken) {
    tokenSources.push({ tokenSource: "long_lived_user", accessToken: input.longLivedAccessToken });
  }

  const endpointResults: FacebookOauthDebugResult["businessDiagnostics"]["endpointResults"] = [];
  const businesses = new Map<string, { id: string; name: string }>();

  for (const token of tokenSources) {
    const businessesResult = await runFacebookDiagnosticRequest({
      endpoint: "/me/businesses",
      fields: "id,name",
      tokenSource: token.tokenSource,
      accessToken: token.accessToken,
    });
    endpointResults.push(businessesResult);

    const parsedBusinesses =
      businessesResult.sanitizedJson &&
      typeof businessesResult.sanitizedJson === "object" &&
      !Array.isArray(businessesResult.sanitizedJson) &&
      Array.isArray((businessesResult.sanitizedJson as { data?: unknown }).data)
        ? ((businessesResult.sanitizedJson as { data?: Array<Record<string, unknown>> }).data ?? [])
        : [];

    for (const business of parsedBusinesses) {
      const businessId = typeof business.id === "string" ? business.id : "";
      const businessName = typeof business.name === "string" ? business.name : "";
      if (businessId && businessName) {
        businesses.set(businessId, { id: businessId, name: businessName });
      }
    }

    endpointResults.push(await runFacebookDiagnosticRequest({
      endpoint: "/me/assigned_pages",
      fields: "id,name,tasks,access_token",
      tokenSource: token.tokenSource,
      accessToken: token.accessToken,
    }));

    for (const business of businesses.values()) {
      endpointResults.push(await runFacebookDiagnosticRequest({
        endpoint: `/${business.id}/owned_pages`,
        fields: "id,name,tasks,access_token",
        tokenSource: token.tokenSource,
        accessToken: token.accessToken,
      }));
      endpointResults.push(await runFacebookDiagnosticRequest({
        endpoint: `/${business.id}/client_pages`,
        fields: "id,name,tasks,access_token",
        tokenSource: token.tokenSource,
        accessToken: token.accessToken,
      }));
    }
  }

  return {
    businesses: Array.from(businesses.values()),
    endpointResults,
  } satisfies FacebookOauthDebugResult["businessDiagnostics"];
}

function buildFacebookDiagnosticSummary(input: {
  grantedScopes: string[];
  missingRequiredScopes: string[];
  coreResults: FacebookOauthDebugResult["endpointResults"];
  businessDiagnostics: FacebookOauthDebugResult["businessDiagnostics"];
}) {
  if (input.missingRequiredScopes.length > 0) {
    return `Facebook login succeeded, but these required scopes are missing: ${input.missingRequiredScopes.join(", ")}.`;
  }

  const accountResults = input.coreResults.filter((result) => result.endpoint.startsWith("/me/accounts"));
  const returnedPages = accountResults.some((result) => (result.dataCount ?? 0) > 0);
  const returnedPageTokens = accountResults.some((result) =>
    (result.parsedAccounts ?? []).some((account) => account.hasPageAccessToken),
  );

  if (returnedPages && !returnedPageTokens) {
    return "Facebook returned Pages, but did not return Page access tokens. Check Page tasks/access and requested fields.";
  }

  if (!returnedPages && input.businessDiagnostics.businesses.length > 0) {
    return "Facebook did not return Pages from /me/accounts. This Page may be managed through Business Manager. Try the Business Manager fallback or add business_management permission.";
  }

  const anyGraphErrors = [...input.coreResults, ...input.businessDiagnostics.endpointResults].find((result) => !result.success);
  if (anyGraphErrors) {
    return "One or more Graph API diagnostics returned an error. Review the sanitized error details below, including code, subcode, type, and fbtrace_id.";
  }

  return "OAuth succeeded and scopes were granted, but this Meta app could not discover any manageable Pages for this user. Check app mode, app role, Page access, and Business Integration Page selection.";
}

async function buildFacebookOauthDebugSnapshotFromSession(input: {
  session: ResolvedFacebookOauthSession;
  redirectUri: string;
  appId: string;
  pageId?: string | null;
}) {
  const session = input.session;
  const missingRequiredScopes = FACEBOOK_REQUIRED_SCOPES.filter((scope) => !session.grantedScopes.includes(scope));
  const tokenDebugResults = await Promise.all([
    debugFacebookUserToken({
      appId: input.appId,
      inputToken: session.tokens.shortLivedAccessToken,
      tokenSource: "short_lived_user",
    }),
    ...(session.tokens.longLivedAccessToken
      ? [
          debugFacebookUserToken({
            appId: input.appId,
            inputToken: session.tokens.longLivedAccessToken,
            tokenSource: "long_lived_user" as const,
          }),
        ]
      : []),
  ]);
  const endpointResults = await runCoreFacebookDiagnosticRequests({
    shortLivedAccessToken: session.tokens.shortLivedAccessToken,
    longLivedAccessToken: session.tokens.longLivedAccessToken,
  });
  const businessDiagnostics = await runBusinessFallbackDiagnostics({
    shortLivedAccessToken: session.tokens.shortLivedAccessToken,
    longLivedAccessToken: session.tokens.longLivedAccessToken,
  });
  const manualPageIdTest = input.pageId
    ? {
        pageId: input.pageId,
        endpointResults: await Promise.all(
          [
            {
              tokenSource: "short_lived_user" as const,
              accessToken: session.tokens.shortLivedAccessToken,
            },
            ...(session.tokens.longLivedAccessToken
              ? [
                  {
                    tokenSource: "long_lived_user" as const,
                    accessToken: session.tokens.longLivedAccessToken,
                  },
                ]
              : []),
          ].flatMap((token) => [
            runFacebookDiagnosticRequest({
              endpoint: `/${input.pageId}`,
              fields: "id,name,access_token",
              tokenSource: token.tokenSource,
              accessToken: token.accessToken,
            }),
          ]),
        ),
      }
    : null;

  const accounts = session.accounts.map((page) => ({
    id: page.id,
    name: page.name,
    tasks: page.tasks ?? [],
    hasPageAccessToken: Boolean(page.accessToken),
  }));
  const summaryMessage = buildFacebookDiagnosticSummary({
    grantedScopes: session.grantedScopes,
    missingRequiredScopes,
    coreResults: endpointResults,
    businessDiagnostics,
  });

  return {
    profile: {
      id: session.profile.id,
      name: session.profile.name,
    },
    permissions: session.permissions,
    accounts,
    grantedScopes: session.grantedScopes,
    tokenExpiresAt: session.tokenExpiresAt?.toISOString() ?? null,
    emptyAccountsMessage:
      accounts.length === 0 ? "OAuth succeeded, but this Meta app could not see any manageable Pages." : null,
    diagnostics: session.diagnostics,
    graphApiVersion: FACEBOOK_GRAPH_VERSION,
    redirectUri: input.redirectUri,
    requestedScopes: [...FACEBOOK_REQUIRED_SCOPES],
    missingRequiredScopes,
    optionalDiagnosticScopes: [...FACEBOOK_OPTIONAL_DIAGNOSTIC_SCOPES],
    tokenInfo: {
      shortLivedExists: Boolean(session.tokens.shortLivedAccessToken),
      longLivedExists: Boolean(session.tokens.longLivedAccessToken),
      longLivedExchangeStatus: session.tokens.longLivedExchangeStatus,
    },
    tokenDebug: tokenDebugResults,
    endpointResults,
    businessDiagnostics,
    manualPageIdTest,
    summaryMessage,
    fetchedAt: new Date().toISOString(),
  } satisfies FacebookOauthDebugResult;
}

export async function getFacebookOauthDebugData(input: { code: string }): Promise<FacebookOauthDebugResult> {
  const config = await getFacebookConfiguration();
  const session = await resolveFacebookOauthSession(input);
  const snapshot = await buildFacebookOauthDebugSnapshotFromSession({
    session,
    redirectUri: config.redirectUri,
    appId: config.appId,
    pageId: config.preferredPageLookupValue || null,
  });
  await setFacebookOauthDebugTokens({
    shortLivedAccessToken: session.tokens.shortLivedAccessToken,
    longLivedAccessToken: session.tokens.longLivedAccessToken,
    redirectUri: snapshot.redirectUri,
    requestedScopes: snapshot.requestedScopes,
    grantedScopes: snapshot.grantedScopes,
    fetchedAt: snapshot.fetchedAt,
  });

  return snapshot;
}

export async function runStoredFacebookManualPageDiagnostics(input: { pageId: string }) {
  const tokenBundle = await getFacebookOauthDebugTokens();
  if (!tokenBundle) {
    throw new Error("Run Facebook Diagnostics first so the app has a fresh diagnostic user token to test against.");
  }

  const existing = await getFacebookOauthDebugResult();
  if (!existing) {
    throw new Error("Run Facebook Diagnostics first before testing a manual Page ID.");
  }

  const endpointResults = await Promise.all(
    [
      {
        tokenSource: "short_lived_user" as const,
        accessToken: tokenBundle.shortLivedAccessToken,
      },
      ...(tokenBundle.longLivedAccessToken
        ? [
            {
              tokenSource: "long_lived_user" as const,
              accessToken: tokenBundle.longLivedAccessToken,
            },
          ]
        : []),
    ].flatMap((token) => [
      runFacebookDiagnosticRequest({
        endpoint: `/${input.pageId}`,
        fields: "id,name,access_token",
        tokenSource: token.tokenSource,
        accessToken: token.accessToken,
      }),
    ]),
  );

  const updatedSnapshot: FacebookOauthDebugResult = {
    ...existing,
    manualPageIdTest: {
      pageId: input.pageId,
      endpointResults,
    },
  };

  await setFacebookOauthDebugResult(updatedSnapshot);
  return updatedSnapshot;
}

async function resolveFacebookPageFromDiagnosticTokens(input: { pageId: string }) {
  const tokenBundle = await getFacebookOauthDebugTokens();
  if (!tokenBundle) {
    throw new Error("Run Facebook Diagnostics first so the app has a fresh diagnostic user token to test against.");
  }

  const resolvedPage = await resolveFacebookPageWithTokenSources({
    pageLookupValue: input.pageId,
    tokenSources: [
      ...(tokenBundle.longLivedAccessToken
        ? [
            {
              tokenSource: "long_lived_user" as const,
              accessToken: tokenBundle.longLivedAccessToken,
            },
          ]
        : []),
      {
        tokenSource: "short_lived_user" as const,
        accessToken: tokenBundle.shortLivedAccessToken,
      },
    ],
    grantedScopes: tokenBundle.grantedScopes,
  });

  if (resolvedPage) {
    return resolvedPage;
  }

  throw new Error("Facebook could not resolve a usable Page access token from the manual Page test result.");
}

export async function connectFacebookPageFromStoredDiagnostics(input: { pageId: string }) {
  const debugSnapshot = await getFacebookOauthDebugResult();
  if (!debugSnapshot) {
    throw new Error("Run Facebook Diagnostics first before connecting a Page from the manual test.");
  }

  const resolvedPage = await resolveFacebookPageFromDiagnosticTokens({
    pageId: input.pageId,
  });

  const connectedAccount = await saveFacebookConnectedPage({
    accountId: debugSnapshot.profile.id,
    accountName: debugSnapshot.profile.name,
    pageId: resolvedPage.pageId,
    pageName: resolvedPage.pageName,
    pageAccessToken: resolvedPage.pageAccessToken,
    pageUrl: resolvedPage.pageUrl,
    scopes: resolvedPage.grantedScopes,
    tokenExpiresAt: debugSnapshot.tokenExpiresAt ? new Date(debugSnapshot.tokenExpiresAt) : null,
  });

  return {
    connectedAccount,
    resolvedPage,
  };
}

export async function saveFacebookConnectedPage(input: {
  accountId: string;
  accountName: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  pageUrl?: string | null;
  pageProfilePictureUrl?: string | null;
  scopes: string[];
  tokenExpiresAt?: Date | null;
}) {
  const testedAt = new Date();
  const metadata = buildFacebookConnectionMetadata({
    pageUrl: input.pageUrl ?? null,
    pageProfilePictureUrl: input.pageProfilePictureUrl ?? null,
    instagram: null,
  });
  const connectedAccount = await prisma.connectedAccount.upsert({
    where: {
      platform: SocialPlatform.FACEBOOK,
    },
    update: {
      accountName: input.accountName,
      accountId: input.accountId,
      pageId: input.pageId,
      pageName: input.pageName,
      accessTokenEncrypted: encryptValue(input.pageAccessToken),
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes: input.scopes,
      status: ConnectedAccountStatus.CONNECTED,
      lastTestedAt: testedAt,
      lastSuccessfulTestAt: testedAt,
      lastFailedTestAt: null,
      lastError: null,
      metadata,
    },
    create: {
      platform: SocialPlatform.FACEBOOK,
      accountName: input.accountName,
      accountId: input.accountId,
      pageId: input.pageId,
      pageName: input.pageName,
      accessTokenEncrypted: encryptValue(input.pageAccessToken),
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes: input.scopes,
      status: ConnectedAccountStatus.CONNECTED,
      lastTestedAt: testedAt,
      lastSuccessfulTestAt: testedAt,
      lastFailedTestAt: null,
      metadata,
    },
  });

  await dismissProviderNotifications({
    provider: SocialPlatform.FACEBOOK,
    types: [
      NotificationType.TOKEN_EXPIRED,
      NotificationType.TOKEN_INVALID,
      NotificationType.MISSING_SCOPE,
    ],
  });

  return connectedAccount;
}

function toFacebookConnectionRecord(record: ConnectedAccount | null): FacebookConnectionRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    platform: record.platform,
    accountName: record.accountName,
    accountId: record.accountId,
    pageId: record.pageId,
    pageName: record.pageName,
    tokenExpiresAt: record.tokenExpiresAt,
    scopes: normalizeFacebookScopes(record.scopes),
    status: record.status,
    lastTestedAt: record.lastTestedAt,
    lastSuccessfulTestAt: record.lastSuccessfulTestAt,
    lastFailedTestAt: record.lastFailedTestAt,
    lastError: record.lastError,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getFacebookConnectionRecord() {
  const record = await prisma.connectedAccount.findUnique({
    where: {
      platform: SocialPlatform.FACEBOOK,
    },
  });

  return toFacebookConnectionRecord(record);
}

export function getFacebookPreviewIdentity(connection: FacebookConnectionRecord | null): FacebookPreviewIdentity {
  const metadata = normalizeFacebookConnectionMetadata(connection?.metadata ?? null);

  return {
    pageName: connection?.pageName ?? null,
    profilePictureUrl: metadata.pageProfilePictureUrl,
  };
}

async function getStoredFacebookConnection(): Promise<FacebookConnection | null> {
  const record = await prisma.connectedAccount.findUnique({
    where: {
      platform: SocialPlatform.FACEBOOK,
    },
  });

  if (
    !record ||
    record.status !== ConnectedAccountStatus.CONNECTED ||
    !record.pageId ||
    !record.pageName ||
    !record.accessTokenEncrypted
  ) {
    return null;
  }

  return {
    ...toFacebookConnectionRecord(record)!,
    accessToken: decryptValue(record.accessTokenEncrypted),
  };
}

export async function getFacebookConnection(): Promise<FacebookConnection | null> {
  const connection = await getStoredFacebookConnection();

  if (!connection || connection.status !== ConnectedAccountStatus.CONNECTED) {
    return null;
  }

  return connection;
}

export async function disconnectFacebookConnection() {
  const record = await prisma.connectedAccount.findUnique({
    where: {
      platform: SocialPlatform.FACEBOOK,
    },
  });

  if (!record) {
    return null;
  }

  const disconnectedAccount = await prisma.connectedAccount.update({
    where: {
      platform: SocialPlatform.FACEBOOK,
    },
    data: {
      accountName: "Disconnected",
      accountId: null,
      pageId: null,
      pageName: null,
      accessTokenEncrypted: null,
      tokenExpiresAt: null,
      scopes: [],
      status: ConnectedAccountStatus.DISCONNECTED,
      lastTestedAt: null,
      lastSuccessfulTestAt: null,
      lastFailedTestAt: null,
      lastError: null,
      metadata: Prisma.JsonNull,
    },
  });

  await dismissProviderNotifications({
    provider: SocialPlatform.FACEBOOK,
    types: [
      NotificationType.TOKEN_EXPIRED,
      NotificationType.TOKEN_INVALID,
      NotificationType.MISSING_SCOPE,
    ],
  });

  return disconnectedAccount;
}

function getMissingFacebookScopes(scopes: string[]) {
  return FACEBOOK_REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
}

function getFacebookStatusFromError(error: FacebookServiceError) {
  if (error.code?.startsWith("190")) {
    return error.message.toLowerCase().includes("expired")
      ? ConnectedAccountStatus.EXPIRED
      : ConnectedAccountStatus.INVALID;
  }

  if (
    error.code === "10" ||
    error.code === "200" ||
    error.message.toLowerCase().includes("permission") ||
    error.message.toLowerCase().includes("scope")
  ) {
    return ConnectedAccountStatus.MISSING_SCOPES;
  }

  if (
    error.message.toLowerCase().includes("access token") ||
    error.message.toLowerCase().includes("unsupported get request")
  ) {
    return ConnectedAccountStatus.INVALID;
  }

  return ConnectedAccountStatus.ERROR;
}

async function updateFacebookConnectionHealthState(input: {
  status: ConnectedAccountStatus;
  message: string | null;
  pageName?: string | null;
  pageUrl?: string | null;
  pageProfilePictureUrl?: string | null;
  existingMetadata?: ConnectedAccount["metadata"];
  instagram?: FacebookLinkedInstagramAccountMetadata | null;
  testedAt: Date;
}) {
  return prisma.connectedAccount.updateMany({
    where: {
      platform: SocialPlatform.FACEBOOK,
    },
    data: {
      status: input.status,
      lastTestedAt: input.testedAt,
      lastSuccessfulTestAt: input.status === ConnectedAccountStatus.CONNECTED ? input.testedAt : undefined,
      lastFailedTestAt: input.status === ConnectedAccountStatus.CONNECTED ? null : input.testedAt,
      lastError: input.status === ConnectedAccountStatus.CONNECTED ? null : input.message,
      pageName: input.pageName ?? undefined,
      metadata: buildFacebookConnectionMetadata({
        existingMetadata: input.existingMetadata,
        pageUrl: input.pageUrl,
        pageProfilePictureUrl: input.pageProfilePictureUrl,
        instagram: input.instagram,
      }),
    },
  });
}

export async function refreshFacebookConnectionHealth(input?: {
  createNotification?: boolean;
  source?: string;
}) {
  const connection = await getStoredFacebookConnection();

  if (!connection) {
    return {
      status: ConnectedAccountStatus.DISCONNECTED,
      pageId: null,
      pageName: null,
      pageUrl: null,
      testedAt: null,
      message: "Connect a Facebook Page before publishing.",
      missingScopes: [...FACEBOOK_REQUIRED_SCOPES],
    } satisfies FacebookConnectionHealthResult;
  }

  const missingScopes = getMissingFacebookScopes(connection.scopes);
  const testedAt = new Date();
  const currentPageUrl =
    connection.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata)
      ? String((connection.metadata as Record<string, unknown>).pageUrl ?? "")
      : null;

  if (!connection.pageId || !connection.accessToken) {
    const message = "Facebook needs to be reconnected before posting.";
    await updateFacebookConnectionHealthState({
      status: ConnectedAccountStatus.NEEDS_RECONNECT,
      message,
      existingMetadata: connection.metadata,
      testedAt,
    });

    if (input?.createNotification !== false) {
      await createOrUpdateFacebookTokenNotification({
        provider: SocialPlatform.FACEBOOK,
        status: "invalid",
      });
    }

    await createAuditLog({
      action: AUDIT_ACTIONS.FACEBOOK_TOKEN_HEALTH_CHECK_FAILED,
      targetType: "ConnectedAccount",
      targetId: connection.id,
      metadata: {
        source: input?.source ?? "unknown",
        status: ConnectedAccountStatus.NEEDS_RECONNECT,
        message,
      },
    });

    return {
      status: ConnectedAccountStatus.NEEDS_RECONNECT,
      pageId: connection.pageId,
      pageName: connection.pageName,
      pageUrl: currentPageUrl,
      testedAt,
      message,
      missingScopes,
    } satisfies FacebookConnectionHealthResult;
  }

  if (missingScopes.length > 0) {
    const message = `Facebook is missing required scopes: ${missingScopes.join(", ")}. Reconnect Facebook to resume posting.`;
    await updateFacebookConnectionHealthState({
      status: ConnectedAccountStatus.MISSING_SCOPES,
      message,
      testedAt,
      pageName: connection.pageName,
      pageUrl: currentPageUrl,
      existingMetadata: connection.metadata,
    });

    if (input?.createNotification !== false) {
      await createOrUpdateFacebookTokenNotification({
        provider: SocialPlatform.FACEBOOK,
        status: "missing_scopes",
        detail: `Missing: ${missingScopes.join(", ")}.`,
      });
    }

    await createAuditLog({
      action: AUDIT_ACTIONS.FACEBOOK_TOKEN_HEALTH_CHECK_FAILED,
      targetType: "ConnectedAccount",
      targetId: connection.id,
      metadata: {
        source: input?.source ?? "unknown",
        status: ConnectedAccountStatus.MISSING_SCOPES,
        missingScopes,
      },
    });

    return {
      status: ConnectedAccountStatus.MISSING_SCOPES,
      pageId: connection.pageId,
      pageName: connection.pageName,
      pageUrl: currentPageUrl,
      testedAt,
      message,
      missingScopes,
    } satisfies FacebookConnectionHealthResult;
  }

  if (connection.tokenExpiresAt && connection.tokenExpiresAt <= testedAt) {
    const message = "Facebook needs to be reconnected before posting.";
    await updateFacebookConnectionHealthState({
      status: ConnectedAccountStatus.EXPIRED,
      message,
      testedAt,
      pageName: connection.pageName,
      pageUrl: currentPageUrl,
      existingMetadata: connection.metadata,
    });

    if (input?.createNotification !== false) {
      await createOrUpdateFacebookTokenNotification({
        provider: SocialPlatform.FACEBOOK,
        status: "expired",
      });
    }

    await createAuditLog({
      action: AUDIT_ACTIONS.FACEBOOK_TOKEN_HEALTH_CHECK_FAILED,
      targetType: "ConnectedAccount",
      targetId: connection.id,
      metadata: {
        source: input?.source ?? "unknown",
        status: ConnectedAccountStatus.EXPIRED,
      },
    });
    await createAuditLog({
      action: AUDIT_ACTIONS.FACEBOOK_TOKEN_EXPIRED,
      targetType: "ConnectedAccount",
      targetId: connection.id,
      metadata: {
        source: input?.source ?? "unknown",
        expiresAt: connection.tokenExpiresAt.toISOString(),
      },
    });

    return {
      status: ConnectedAccountStatus.EXPIRED,
      pageId: connection.pageId,
      pageName: connection.pageName,
      pageUrl: currentPageUrl,
      testedAt,
      message,
      missingScopes,
    } satisfies FacebookConnectionHealthResult;
  }

  try {
    const instagram = await resolveLinkedInstagramAccount({
      pageId: connection.pageId,
      accessToken: connection.accessToken,
    });
    const url = buildFacebookGraphUrl(`/${connection.pageId}`, {
      access_token: connection.accessToken,
      fields: "id,name,link,picture{url}",
    });
    const page = await facebookGraphRequestJson<{
      id: string;
      name: string;
      link?: string;
      picture?: {
        data?: {
          url?: string;
        };
      };
    }>(url, { method: "GET" });

    await updateFacebookConnectionHealthState({
      status: ConnectedAccountStatus.CONNECTED,
      message: null,
      testedAt,
      pageName: page.name || connection.pageName,
      pageUrl: page.link ?? null,
      pageProfilePictureUrl: page.picture?.data?.url ?? null,
      existingMetadata: connection.metadata,
      instagram,
    });

    if (input?.createNotification !== false) {
      await dismissProviderNotifications({
        provider: SocialPlatform.FACEBOOK,
        types: [
          NotificationType.TOKEN_EXPIRED,
          NotificationType.TOKEN_INVALID,
          NotificationType.MISSING_SCOPE,
        ],
      });
    }

    return {
      status: ConnectedAccountStatus.CONNECTED,
      pageId: page.id,
      pageName: page.name,
      pageUrl: page.link ?? null,
      testedAt,
      message: null,
      missingScopes,
    } satisfies FacebookConnectionHealthResult;
  } catch (error) {
    const normalizedError = handleFacebookApiError(error);
    const nextStatus = getFacebookStatusFromError(normalizedError);

    await updateFacebookConnectionHealthState({
      status: nextStatus,
      message: normalizedError.message,
      testedAt,
      pageName: connection.pageName,
      pageUrl: currentPageUrl,
      existingMetadata: connection.metadata,
    });

    if (input?.createNotification !== false) {
      await createOrUpdateFacebookTokenNotification({
        provider: SocialPlatform.FACEBOOK,
        status:
          nextStatus === ConnectedAccountStatus.EXPIRED
            ? "expired"
            : nextStatus === ConnectedAccountStatus.MISSING_SCOPES
              ? "missing_scopes"
              : "invalid",
        detail: normalizedError.message,
      });
    }

    await createAuditLog({
      action: AUDIT_ACTIONS.FACEBOOK_TOKEN_HEALTH_CHECK_FAILED,
      targetType: "ConnectedAccount",
      targetId: connection.id,
      metadata: {
        source: input?.source ?? "unknown",
        status: nextStatus,
        message: normalizedError.message,
        code: normalizedError.code,
      },
    });

    if (nextStatus === ConnectedAccountStatus.EXPIRED) {
      await createAuditLog({
        action: AUDIT_ACTIONS.FACEBOOK_TOKEN_EXPIRED,
        targetType: "ConnectedAccount",
        targetId: connection.id,
        metadata: {
          source: input?.source ?? "unknown",
          message: normalizedError.message,
        },
      });
    }

    return {
      status: nextStatus,
      pageId: connection.pageId,
      pageName: connection.pageName,
      pageUrl: currentPageUrl,
      testedAt,
      message: normalizedError.message,
      missingScopes,
    } satisfies FacebookConnectionHealthResult;
  }
}

export async function testFacebookConnection() {
  const connection = await getStoredFacebookConnection();

  if (!connection) {
    throw new Error("Connect a Facebook Page before testing the connection.");
  }

  const result = await refreshFacebookConnectionHealth({
    createNotification: true,
    source: "manual_test",
  });

  if (result.status !== ConnectedAccountStatus.CONNECTED || !result.pageId || !result.pageName || !result.testedAt) {
    throw new Error(result.message || "Facebook needs to be reconnected before posting.");
  }

  return {
    pageId: result.pageId,
    pageName: result.pageName,
    pageUrl: result.pageUrl,
    testedAt: result.testedAt,
  } satisfies FacebookConnectionTestResult;
}

export async function validateFacebookPublishPrerequisites(input: {
  caption: string;
  mediaAsset:
    | {
        id: string;
        mimeType: string;
        sizeBytes?: bigint | string;
        width?: number;
        height?: number;
        storagePath: string;
      }
    | null
    | undefined;
}) {
  await assertFacebookRuntimeReady();
  const health = await refreshFacebookConnectionHealth({
    createNotification: true,
    source: "publish_prerequisite_check",
  });
  if (health.status !== ConnectedAccountStatus.CONNECTED) {
    throw new Error("Facebook needs to be reconnected before posting.");
  }

  const connection = await getFacebookConnection();
  if (!connection?.pageId) {
    throw new Error("Connect a Facebook Page before publishing.");
  }

  const trimmedCaption = input.caption.trim();
  if (!trimmedCaption) {
    throw new Error("Caption is required before publishing to Facebook.");
  }

  if (input.mediaAsset) {
    const validatedOriginal = await validateStoredOriginalMediaAsset({
      mediaAsset: input.mediaAsset,
    });

    return {
      connection,
      caption: trimmedCaption,
      originalMediaAsset: input.mediaAsset,
      validatedOriginal,
    };
  }

  return {
    connection,
    caption: trimmedCaption,
    originalMediaAsset: null,
    validatedOriginal: null,
  };
}

export function buildFacebookPostPayload(input: {
  caption: string;
  mediaAsset:
    | {
        id: string;
        mimeType: string;
        sizeBytes?: bigint | string;
        width?: number;
        height?: number;
        storagePath: string;
      }
    | null
    | undefined;
}) {
  return {
    kind: input.mediaAsset ? "image" : "text",
    variantId: null,
    summary: {
      captionLength: input.caption.trim().length,
      hasMedia: Boolean(input.mediaAsset),
      mediaAssetId: input.mediaAsset?.id ?? null,
      mediaVariantId: null,
      mediaVariantDimensions:
        input.mediaAsset?.width && input.mediaAsset?.height
          ? `${input.mediaAsset.width}x${input.mediaAsset.height}`
          : null,
      mediaStoragePath: input.mediaAsset?.storagePath ?? null,
    },
  } as const;
}

export async function publishFacebookTextPost(input: {
  accessToken: string;
  pageId: string;
  caption: string;
}) {
  const body = new URLSearchParams();
  body.set("message", input.caption);
  body.set("access_token", input.accessToken);

  const response = await facebookGraphRequestJson<{
    id: string;
  }>(buildFacebookGraphUrl(`/${input.pageId}/feed`), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return {
    id: response.id,
    responseSummary: {
      endpoint: "feed",
      id: response.id,
    } satisfies Prisma.InputJsonObject,
  };
}

export async function publishFacebookImagePost(input: {
  accessToken: string;
  pageId: string;
  caption: string;
  absolutePath: string;
}) {
  const fileBuffer = await readFile(input.absolutePath);
  const formData = new FormData();

  if (input.caption.trim()) {
    formData.set("message", input.caption.trim());
  }

  formData.set("access_token", input.accessToken);
  formData.set("published", "true");
  formData.set("source", new Blob([fileBuffer], { type: "image/jpeg" }), "facebook-feed.jpg");

  const response = await facebookGraphRequestJson<{
    id: string;
    post_id?: string;
  }>(buildFacebookGraphUrl(`/${input.pageId}/photos`), {
    method: "POST",
    body: formData,
  });

  return {
    id: response.post_id || response.id,
    responseSummary: {
      endpoint: "photos",
      photoId: response.id,
      postId: response.post_id ?? null,
    } satisfies Prisma.InputJsonObject,
  };
}

function appendFacebookTempImageDiagnostics(
  responseSummary: Prisma.InputJsonValue | null | undefined,
  input: {
    originalMediaAssetId: string | null;
    originalStoragePath: string | null;
    temporaryImage:
      | {
          storagePath: string;
          width: number;
          height: number;
          sizeBytes: bigint;
          mimeType: string;
        }
      | null;
    cleanupResult:
      | {
          status: "deleted" | "missing" | "failed";
          message: string | null;
        }
      | null;
  },
) {
  const base =
    responseSummary && typeof responseSummary === "object" && !Array.isArray(responseSummary)
      ? { ...(responseSummary as Prisma.InputJsonObject) }
      : {};

  return {
    ...base,
    originalMediaAssetId: input.originalMediaAssetId,
    originalStoragePath: input.originalStoragePath,
    temporaryPlatformImage: input.temporaryImage
      ? {
          storagePath: input.temporaryImage.storagePath,
          width: input.temporaryImage.width,
          height: input.temporaryImage.height,
          sizeBytes: input.temporaryImage.sizeBytes.toString(),
          mimeType: input.temporaryImage.mimeType,
        }
      : null,
    temporaryPlatformImageCleanup: input.cleanupResult,
  } satisfies Prisma.InputJsonObject;
}

async function fetchFacebookPostUrl(input: { accessToken: string; platformPostId: string }) {
  try {
    const response = await facebookGraphRequestJson<{
      permalink_url?: string;
    }>(
      buildFacebookGraphUrl(`/${input.platformPostId}`, {
        access_token: input.accessToken,
        fields: "permalink_url",
      }),
      { method: "GET" },
    );

    return response.permalink_url ?? null;
  } catch {
    if (!input.platformPostId.includes("_")) {
      return null;
    }

    const [pageId, postId] = input.platformPostId.split("_", 2);
    return pageId && postId ? `https://www.facebook.com/${pageId}/posts/${postId}` : null;
  }
}

export async function publishFacebookPost(input: {
  caption: string;
  mediaAsset:
    | {
        id: string;
        mimeType: string;
        sizeBytes?: bigint | string;
        width?: number;
        height?: number;
        storagePath: string;
      }
    | null
    | undefined;
}) {
  const payload = buildFacebookPostPayload(input);
  const validation = await validateFacebookPublishPrerequisites(input);
  let temporaryImage:
    | {
        absolutePath: string;
        storagePath: string;
        mimeType: string;
        width: number;
        height: number;
        sizeBytes: bigint;
      }
    | null = null;
  let cleanupResult:
    | {
        status: "deleted" | "missing" | "failed";
        message: string | null;
      }
    | null = null;
  let publishedResult:
    | {
        platformPostId: string;
        platformPostUrl: string | null;
        responseSummary: Prisma.InputJsonObject;
      }
    | null = null;
  let publishError: unknown = null;

  try {
    if (payload.kind === "image" && validation.originalMediaAsset) {
      temporaryImage = await generateTemporaryPlatformImage({
        mediaAsset: validation.originalMediaAsset,
        platform: "FACEBOOK",
      });

      const validatedTempImage = await validateStoredMediaFile({
        storagePath: temporaryImage.storagePath,
        expectedMimeType: temporaryImage.mimeType,
        maxFileSizeBytes: FACEBOOK_MAX_IMAGE_BYTES,
      });

      const publishResult = await publishFacebookImagePost({
        accessToken: validation.connection.accessToken,
        pageId: validation.connection.pageId!,
        caption: validation.caption,
        absolutePath: validatedTempImage.absolutePath,
      });

      const platformPostUrl = await fetchFacebookPostUrl({
        accessToken: validation.connection.accessToken,
        platformPostId: publishResult.id,
      });

      publishedResult = {
        platformPostId: publishResult.id,
        platformPostUrl,
        responseSummary: {
          ...publishResult.responseSummary,
          pageId: validation.connection.pageId,
          pageName: validation.connection.pageName,
          platformPostUrl,
        } satisfies Prisma.InputJsonObject,
      };
    } else {
      const publishResult = await publishFacebookTextPost({
        accessToken: validation.connection.accessToken,
        pageId: validation.connection.pageId!,
        caption: validation.caption,
      });

      const platformPostUrl = await fetchFacebookPostUrl({
        accessToken: validation.connection.accessToken,
        platformPostId: publishResult.id,
      });

      publishedResult = {
        platformPostId: publishResult.id,
        platformPostUrl,
        responseSummary: {
          ...publishResult.responseSummary,
          pageId: validation.connection.pageId,
          pageName: validation.connection.pageName,
          platformPostUrl,
        } satisfies Prisma.InputJsonObject,
      };
    }
  } catch (error) {
    publishError = error;
  } finally {
    if (temporaryImage) {
      cleanupResult = await cleanupTemporaryPlatformImage(temporaryImage.absolutePath);
      if (cleanupResult.status === "failed") {
        console.warn("Temporary Facebook publish image cleanup failed.", {
          storagePath: temporaryImage.storagePath,
          message: cleanupResult.message,
        });
      }
    }
  }

  if (publishedResult) {
    return {
      platformPostId: publishedResult.platformPostId,
      platformPostUrl: publishedResult.platformPostUrl,
      responseSummary: appendFacebookTempImageDiagnostics(publishedResult.responseSummary, {
        originalMediaAssetId: validation.originalMediaAsset?.id ?? null,
        originalStoragePath: validation.originalMediaAsset?.storagePath ?? null,
        temporaryImage,
        cleanupResult,
      }),
    } satisfies FacebookPublishResult;
  }

  const normalizedError = handleFacebookApiError(publishError);
  throw new FacebookServiceError(normalizedError.message, {
    code: normalizedError.code,
    responseSummary: appendFacebookTempImageDiagnostics(normalizedError.responseSummary, {
      originalMediaAssetId: validation.originalMediaAsset?.id ?? null,
      originalStoragePath: validation.originalMediaAsset?.storagePath ?? null,
      temporaryImage,
      cleanupResult,
    }),
  });
}

function normalizeFacebookErrorCode(code: string | number | null | undefined, subcode?: string | number | null) {
  const primary = code === null || code === undefined ? "" : String(code);
  const secondary = subcode === null || subcode === undefined ? "" : String(subcode);
  return secondary ? `${primary}:${secondary}` : primary || null;
}

function mapFacebookApiErrorToFriendlyMessage(input: {
  code: string | null;
  technicalMessage: string;
  type?: string | null;
  subcode?: string | number | null;
}) {
  const message = input.technicalMessage.toLowerCase();
  const code = input.code ?? "";

  if (code.startsWith("190")) {
    return "The Facebook access token has expired or is no longer valid. Reconnect the Facebook Page and try again.";
  }

  if (code === "10" || code === "200" || message.includes("permission") || message.includes("scope")) {
    return "The Facebook connection is missing one or more required Page permissions. Reconnect the Page and confirm the requested scopes.";
  }

  if (message.includes("development mode") || message.includes("app must be live") || message.includes("app isn't available")) {
    return "This Meta app is not available for the current account in its present app mode. Confirm the app is live or that the test user has access.";
  }

  if (code === "4" || code === "17" || code === "32" || code === "613" || message.includes("rate limit")) {
    return "Facebook rate-limited the request. Wait a moment and retry the publish.";
  }

  if (message.includes("access token") || message.includes("unsupported get request")) {
    return "The stored Facebook Page token is invalid for this Page. Reconnect the Page and test the connection again.";
  }

  if (message.includes("image") || message.includes("photo") || message.includes("media")) {
    if (message.includes("too large") || message.includes("dimensions")) {
      return "Facebook rejected the image because it was too large or invalid. Re-upload or regenerate the media asset.";
    }

    return "Facebook could not accept the image upload. Confirm the original media can be optimized successfully and try again.";
  }

  if (input.type === "OAuthException") {
    return "Facebook rejected the request due to an OAuth or app configuration issue. Reconnect the Page or review the app setup.";
  }

  return "Facebook returned an unexpected response while publishing. Review the latest publish attempt details and try again.";
}

export function handleFacebookApiError(error: unknown) {
  if (error instanceof FacebookServiceError) {
    const responseSummary =
      error.responseSummary && typeof error.responseSummary === "object" && !Array.isArray(error.responseSummary)
        ? (error.responseSummary as Record<string, unknown>)
        : null;

    const friendlyMessage = mapFacebookApiErrorToFriendlyMessage({
      code: error.code,
      technicalMessage:
        typeof responseSummary?.technicalMessage === "string" ? responseSummary.technicalMessage : error.message,
      type: typeof responseSummary?.type === "string" ? responseSummary.type : null,
      subcode:
        typeof responseSummary?.subcode === "string" || typeof responseSummary?.subcode === "number"
          ? responseSummary.subcode
          : null,
    });

    return new FacebookServiceError(friendlyMessage, {
      code: error.code,
      responseSummary: error.responseSummary,
    });
  }

  if (error instanceof Error) {
    return new FacebookServiceError(error.message);
  }

  return new FacebookServiceError("Facebook returned an unknown error.");
}

export async function executeFacebookPublish(input: {
  socialPostId: string;
  socialPostPlatformId: string;
}) {
  const platformRecord = await prisma.socialPostPlatform.findUnique({
    where: {
      id: input.socialPostPlatformId,
    },
    include: {
      socialPost: {
        include: {
          mediaAsset: {
            include: {
              variants: true,
            },
          },
        },
      },
    },
  });

  if (!platformRecord || platformRecord.socialPostId !== input.socialPostId) {
    throw new Error("Facebook platform record not found.");
  }

  if (platformRecord.platform !== SocialPlatform.FACEBOOK) {
    throw new Error("Only Facebook publishing is implemented in this phase.");
  }

  if (platformRecord.platformPostId || platformRecord.socialPost.status === SocialPostStatus.PUBLISHED) {
    throw new Error("This Facebook post was already published and will not be published again.");
  }

  const requestPayload = buildFacebookPostPayload({
    caption: platformRecord.socialPost.caption,
    mediaAsset: platformRecord.socialPost.mediaAsset,
  });

  const attempt = await prisma.publishAttempt.create({
    data: {
      socialPostId: platformRecord.socialPostId,
      socialPostPlatformId: platformRecord.id,
      platform: SocialPlatform.FACEBOOK,
      status: PublishAttemptStatus.PENDING,
      requestSummary: {
        ...requestPayload.summary,
        statusAtAttempt: platformRecord.status,
      },
      startedAt: new Date(),
    },
  });

  try {
    const result = await publishFacebookPost({
      caption: platformRecord.socialPost.caption,
      mediaAsset: platformRecord.socialPost.mediaAsset,
    });
    const finishedAt = new Date();

    await prisma.$transaction([
      prisma.publishAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: PublishAttemptStatus.SUCCEEDED,
          responseSummary: result.responseSummary,
          platformPostId: result.platformPostId,
          platformPostUrl: result.platformPostUrl,
          finishedAt,
        },
      }),
      prisma.socialPostPlatform.update({
        where: {
          id: platformRecord.id,
        },
        data: {
          status: SocialPostStatus.PUBLISHED,
          publishedAt: finishedAt,
          platformPostId: result.platformPostId,
          platformPostUrl: result.platformPostUrl,
          lastError: null,
        },
      }),
      prisma.socialPost.update({
        where: {
          id: platformRecord.socialPostId,
        },
        data: {
          status: SocialPostStatus.PUBLISHED,
          publishedAt: finishedAt,
          failureReason: null,
        },
      }),
    ]);

    return {
      attemptId: attempt.id,
      result,
      finishedAt,
      status: SocialPostStatus.PUBLISHED,
    };
  } catch (error) {
    const finishedAt = new Date();
    const normalizedError = handleFacebookApiError(error);

    await prisma.$transaction([
      prisma.publishAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: PublishAttemptStatus.FAILED,
          errorCode: normalizedError.code,
          errorMessage: normalizedError.message,
          responseSummary: normalizedError.responseSummary ?? undefined,
          finishedAt,
        },
      }),
      prisma.socialPostPlatform.update({
        where: {
          id: platformRecord.id,
        },
        data: {
          status: SocialPostStatus.FAILED,
          lastError: normalizedError.message,
        },
      }),
      prisma.socialPost.update({
        where: {
          id: platformRecord.socialPostId,
        },
        data: {
          status: SocialPostStatus.FAILED,
          failureReason: normalizedError.message,
        },
      }),
    ]);

    throw normalizedError;
  }
}

export async function claimFacebookPostForPublishing(input: {
  socialPostId: string;
  allowedStatuses: SocialPostStatus[];
}): Promise<FacebookPublishClaimResult> {
  try {
    return await prisma.$transaction(async (tx) => {
    const platformRecord = await tx.socialPostPlatform.findUnique({
      where: {
        socialPostId_platform: {
          socialPostId: input.socialPostId,
          platform: SocialPlatform.FACEBOOK,
        },
      },
      select: {
        id: true,
        socialPostId: true,
        status: true,
        platformPostId: true,
        publishedAt: true,
        socialPost: {
          select: {
            status: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!platformRecord || !input.allowedStatuses.includes(platformRecord.status)) {
      return {
        ok: false,
        reason: "INVALID_STATUS",
        message: "This post is not in a publishable state.",
      };
    }

    if (
      platformRecord.platformPostId ||
      platformRecord.publishedAt ||
      platformRecord.socialPost.status === SocialPostStatus.PUBLISHED ||
      platformRecord.socialPost.publishedAt
    ) {
      return {
        ok: false,
        reason: "ALREADY_PUBLISHED",
        message: "This Facebook post was already published and cannot be published again.",
      };
    }

    const runningAttempt = await tx.publishAttempt.findFirst({
      where: {
        socialPostId: input.socialPostId,
        platform: SocialPlatform.FACEBOOK,
        status: PublishAttemptStatus.PENDING,
        finishedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (runningAttempt) {
      return {
        ok: false,
        reason: "ALREADY_RUNNING",
        message: "A Facebook publish attempt is already running for this post.",
      };
    }

    const platformClaim = await tx.socialPostPlatform.updateMany({
      where: {
        id: platformRecord.id,
        status: {
          in: input.allowedStatuses,
        },
        platformPostId: null,
      },
      data: {
        status: SocialPostStatus.PUBLISHING,
        lastError: null,
      },
    });

    if (platformClaim.count !== 1) {
      return {
        ok: false,
        reason: "CLAIM_CONFLICT",
        message: "Another publish action already claimed this post.",
      };
    }

    const postClaim = await tx.socialPost.updateMany({
      where: {
        id: input.socialPostId,
        status: {
          in: input.allowedStatuses,
        },
      },
      data: {
        status: SocialPostStatus.PUBLISHING,
        failureReason: null,
      },
    });

    if (postClaim.count !== 1) {
      throw new Error("CLAIM_CONFLICT");
    }

    return {
      ok: true,
      socialPostId: input.socialPostId,
      socialPostPlatformId: platformRecord.id,
    };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CLAIM_CONFLICT") {
      return {
        ok: false,
        reason: "CLAIM_CONFLICT",
        message: "Another publish action already claimed this post.",
      };
    }

    throw error;
  }
}

async function facebookGraphRequestJson<T>(input: URL, init: RequestInit) {
  const response = await fetch(input, init);
  const text = await response.text();
  let payload: T & FacebookApiErrorPayload;

  try {
    payload = text ? (JSON.parse(text) as T & FacebookApiErrorPayload) : ({} as T & FacebookApiErrorPayload);
  } catch {
    throw new FacebookServiceError("Facebook returned an unreadable response.", {
      code: "UNKNOWN_RESPONSE",
      responseSummary: {
        status: response.status,
        bodyPreview: text.slice(0, 300),
      } satisfies Prisma.InputJsonObject,
    });
  }

  if (!response.ok || payload.error) {
    const errorPayload = payload.error ?? {};
    const technicalMessage = errorPayload.message || "Facebook API request failed.";
    const code = normalizeFacebookErrorCode(errorPayload.code ?? null, errorPayload.error_subcode ?? null);
    throw new FacebookServiceError(errorPayload.message || "Facebook API request failed.", {
      code,
      responseSummary: {
        status: response.status,
        code: errorPayload.code ?? null,
        technicalMessage,
        type: errorPayload.type ?? null,
        subcode: errorPayload.error_subcode ?? null,
        fbtraceId: errorPayload.fbtrace_id ?? null,
      } satisfies Prisma.InputJsonObject,
    });
  }

  return payload;
}
