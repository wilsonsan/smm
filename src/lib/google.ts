import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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
import {
  GOOGLE_SETTINGS_ACTION_URL,
  createOrUpdateGoogleDisconnectedNotification,
  createOrUpdateGooglePublishFailedNotification,
  createOrUpdateGoogleTokenNotification,
  dismissProviderNotifications,
} from "@/lib/notifications";
import { resolveRenderedPlatformContent } from "@/lib/posts";
import { syncSocialPostAggregateState } from "@/lib/publish-state";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getGoogleClientSecretSetting, getTokenEncryptionKeyState } from "@/lib/secure-settings";
import {
  APP_SETTING_KEYS,
  getAppSettingValue,
  getAppSettings,
  getBusinessVariableSettings,
  getDeveloperSettings,
  getHashtagSettings,
  getGoogleClientIdSetting,
  upsertAppSetting,
} from "@/lib/settings";
import {
  cleanupTemporaryPlatformImage,
  generateTemporaryPlatformImage,
  type TemporaryMediaCleanupResult,
  type TemporaryPlatformImage,
} from "@/lib/uploads";
import { createSignedPublicPlatformMediaUrl } from "@/lib/public-platform-media";

const GOOGLE_OAUTH_STATE_COOKIE_NAME = "smm_google_oauth_state";
const GOOGLE_OAUTH_MODE_COOKIE_NAME = "smm_google_oauth_mode";
const GOOGLE_PENDING_SELECTION_COOKIE_NAME = "smm_google_pending_selection";
const GOOGLE_STATE_MAX_AGE_SECONDS = 10 * 60;

const GOOGLE_REQUIRED_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
] as const;

const GOOGLE_IDENTITY_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
] as const;

export const GOOGLE_OAUTH_SCOPES = [
  ...GOOGLE_REQUIRED_OAUTH_SCOPES,
  ...GOOGLE_IDENTITY_OAUTH_SCOPES,
] as const;

export type GoogleOauthMode = "connect" | "reconnect";

type GoogleUserProfile = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

type GoogleAccountResource = {
  name: string;
  accountName?: string;
  type?: string;
  role?: string;
};

type GoogleLocationResource = {
  locationId: string;
  locationResourceName: string;
  localPostParent: string;
  title: string;
  storeCode: string | null;
  accountName: string;
  accountResourceName: string;
};

type PendingGoogleLocationSelection = {
  mode: GoogleOauthMode;
  userProfile: {
    sub: string;
    email: string | null;
    name: string | null;
    picture: string | null;
  };
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  locations: GoogleLocationResource[];
};

type GoogleConnectionMetadata = {
  accountEmail: string | null;
  accountDisplayName: string | null;
  accountProfilePictureUrl: string | null;
  accountResourceName: string | null;
  locationResourceName: string | null;
  localPostParent: string | null;
  storeCode: string | null;
  lastTokenRefreshAt: string | null;
  lastPublishAt: string | null;
  lastPublishPostId: string | null;
  lastPublishError: string | null;
  lastPublishAttemptId: string | null;
};

export type GoogleConfiguration = {
  clientId: string;
  clientSecretConfigured: boolean;
  clientSecretSource: "settings" | "environment" | "missing";
  tokenEncryptionKeyConfigured: boolean;
  tokenEncryptionKeySource: "settings" | "environment" | "missing";
  redirectUri: string;
  requiredScopes: string[];
  missingConfig: string[];
  publicAppUrl: string;
};

function buildGoogleRedirectUri(publicAppUrl: string) {
  return new URL("/api/google/callback", publicAppUrl).toString();
}

export type GoogleConnectionRecord = {
  id: string;
  platform: SocialPlatform;
  accountName: string;
  accountId: string | null;
  locationId: string | null;
  locationName: string | null;
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

export type GoogleConnection = GoogleConnectionRecord & {
  accessToken: string;
  refreshToken: string | null;
};

export type GoogleConnectionTestResult = {
  locationId: string;
  locationName: string;
  testedAt: Date;
};

export type GoogleDiagnosticsResult = {
  configuration: GoogleConfiguration;
  connection: GoogleConnectionRecord | null;
  tokenStatus: {
    hasRefreshToken: boolean;
    expiresAt: string | null;
    missingScopes: string[];
  };
  location: {
    id: string | null;
    name: string | null;
    accountName: string | null;
    accountEmail: string | null;
    accountProfilePictureUrl: string | null;
  };
  lastTest: {
    success: boolean;
    testedAt: string | null;
    message: string;
  };
  lastPublish: {
    at: string | null;
    postId: string | null;
    lastError: string | null;
  };
};

export type GoogleFoundationState = {
  status: "READY" | "NOT_CONNECTED" | "NEEDS_RECONNECT";
  locationId: string | null;
  locationName: string | null;
  accountName: string | null;
  accountEmail: string | null;
  accountProfilePictureUrl: string | null;
  lastCheckedAt: string | null;
  isSelectableInComposer: boolean;
  message: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
};

async function buildTokenEncryptionKey() {
  const tokenEncryptionKey = await getTokenEncryptionKeyState();
  if (!tokenEncryptionKey.configured || !tokenEncryptionKey.value) {
    throw new Error("A token encryption key is required before Google tokens can be stored securely.");
  }

  return createHash("sha256").update(tokenEncryptionKey.value).digest();
}

async function encryptValue(value: string) {
  const key = await buildTokenEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

async function decryptValue(value: string) {
  const key = await buildTokenEncryptionKey();
  const [ivPart, tagPart, encryptedPart] = value.split(".");

  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Stored encrypted Google token payload is invalid.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeScopes(scopes: unknown) {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes.map((scope) => String(scope).trim()).filter(Boolean);
}

function buildGoogleConnectionMetadata(input: {
  accountEmail?: string | null;
  accountDisplayName?: string | null;
  accountProfilePictureUrl?: string | null;
  accountResourceName?: string | null;
  locationResourceName?: string | null;
  localPostParent?: string | null;
  storeCode?: string | null;
  lastTokenRefreshAt?: string | null;
  lastPublishAt?: string | null;
  lastPublishPostId?: string | null;
  lastPublishError?: string | null;
  lastPublishAttemptId?: string | null;
  existingMetadata?: ConnectedAccount["metadata"];
}) {
  const existing = normalizeGoogleConnectionMetadata(input.existingMetadata ?? null);
  const next: GoogleConnectionMetadata = {
    accountEmail: input.accountEmail ?? existing.accountEmail,
    accountDisplayName: input.accountDisplayName ?? existing.accountDisplayName,
    accountProfilePictureUrl: input.accountProfilePictureUrl ?? existing.accountProfilePictureUrl,
    accountResourceName: input.accountResourceName ?? existing.accountResourceName,
    locationResourceName: input.locationResourceName ?? existing.locationResourceName,
    localPostParent: input.localPostParent ?? existing.localPostParent,
    storeCode: input.storeCode ?? existing.storeCode,
    lastTokenRefreshAt: input.lastTokenRefreshAt ?? existing.lastTokenRefreshAt,
    lastPublishAt: input.lastPublishAt ?? existing.lastPublishAt,
    lastPublishPostId: input.lastPublishPostId ?? existing.lastPublishPostId,
    lastPublishError: input.lastPublishError ?? existing.lastPublishError,
    lastPublishAttemptId: input.lastPublishAttemptId ?? existing.lastPublishAttemptId,
  };

  return next satisfies Prisma.InputJsonObject;
}

function normalizeGoogleConnectionMetadata(metadata: ConnectedAccount["metadata"]): GoogleConnectionMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      accountEmail: null,
      accountDisplayName: null,
      accountProfilePictureUrl: null,
      accountResourceName: null,
      locationResourceName: null,
      localPostParent: null,
      storeCode: null,
      lastTokenRefreshAt: null,
      lastPublishAt: null,
      lastPublishPostId: null,
      lastPublishError: null,
      lastPublishAttemptId: null,
    };
  }

  const raw = metadata as Record<string, unknown>;
  return {
    accountEmail: typeof raw.accountEmail === "string" ? raw.accountEmail : null,
    accountDisplayName: typeof raw.accountDisplayName === "string" ? raw.accountDisplayName : null,
    accountProfilePictureUrl: typeof raw.accountProfilePictureUrl === "string" ? raw.accountProfilePictureUrl : null,
    accountResourceName: typeof raw.accountResourceName === "string" ? raw.accountResourceName : null,
    locationResourceName: typeof raw.locationResourceName === "string" ? raw.locationResourceName : null,
    localPostParent: typeof raw.localPostParent === "string" ? raw.localPostParent : null,
    storeCode: typeof raw.storeCode === "string" ? raw.storeCode : null,
    lastTokenRefreshAt: typeof raw.lastTokenRefreshAt === "string" ? raw.lastTokenRefreshAt : null,
    lastPublishAt: typeof raw.lastPublishAt === "string" ? raw.lastPublishAt : null,
    lastPublishPostId: typeof raw.lastPublishPostId === "string" ? raw.lastPublishPostId : null,
    lastPublishError: typeof raw.lastPublishError === "string" ? raw.lastPublishError : null,
    lastPublishAttemptId: typeof raw.lastPublishAttemptId === "string" ? raw.lastPublishAttemptId : null,
  };
}

function buildGoogleOAuthAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url.toString();
}

function getLocationIdFromName(name: string) {
  const parts = name.split("/");
  return parts[parts.length - 1] || name;
}

async function googleTokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();
  let payload: GoogleTokenResponse & { error?: string; error_description?: string };

  try {
    payload = text ? (JSON.parse(text) as typeof payload) : ({} as typeof payload);
  } catch {
    throw new Error("Google returned an unreadable OAuth response.");
  }

  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || "Google OAuth token exchange failed.");
  }

  return payload;
}

async function googleApiJson<T>(input: {
  url: string;
  accessToken: string;
  method?: "GET" | "POST";
  body?: Prisma.InputJsonValue | null;
}) {
  const response = await fetch(input.url, {
    method: input.method || "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const text = await response.text();
  let payload: T & GoogleApiErrorPayload;

  try {
    payload = text ? (JSON.parse(text) as T & GoogleApiErrorPayload) : ({} as T & GoogleApiErrorPayload);
  } catch {
    throw new Error(`Google returned an unreadable response (${response.status}).`);
  }

  if (!response.ok || payload.error) {
    const errorPayload = payload.error;
    throw new Error(
      errorPayload?.message || `Google API request failed (${response.status}).`,
    );
  }

  return payload;
}

async function getGoogleUserProfile(accessToken: string) {
  return googleApiJson<GoogleUserProfile>({
    url: "https://openidconnect.googleapis.com/v1/userinfo",
    accessToken,
  });
}

function hasGoogleIdentityScopes(scopes: string[]) {
  return GOOGLE_IDENTITY_OAUTH_SCOPES.some((scope) => scopes.includes(scope));
}

async function getGoogleUserProfileIfAvailable(input: { accessToken: string; scopes: string[] }) {
  if (!hasGoogleIdentityScopes(input.scopes)) {
    return null;
  }

  try {
    return await getGoogleUserProfile(input.accessToken);
  } catch {
    return null;
  }
}

async function listGoogleAccounts(accessToken: string) {
  const response = await googleApiJson<{
    accounts?: GoogleAccountResource[];
    nextPageToken?: string;
  }>({
    url: "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
    accessToken,
  });

  return response.accounts ?? [];
}

async function listGoogleLocationsForAccount(input: { accessToken: string; account: GoogleAccountResource }) {
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${input.account.name}/locations`);
  url.searchParams.set("readMask", "name,title,storeCode");
  url.searchParams.set("pageSize", "100");

  const response = await googleApiJson<{
    locations?: Array<{
      name: string;
      title?: string;
      storeCode?: string;
    }>;
  }>({
    url: url.toString(),
    accessToken: input.accessToken,
  });

  return (response.locations ?? []).map((location) => {
    const locationId = getLocationIdFromName(location.name);
    return {
      locationId,
      locationResourceName: location.name,
      localPostParent: `${input.account.name}/locations/${locationId}`,
      title: location.title || locationId,
      storeCode: location.storeCode ?? null,
      accountName: input.account.accountName || input.account.name,
      accountResourceName: input.account.name,
    } satisfies GoogleLocationResource;
  });
}

async function discoverGoogleLocations(accessToken: string) {
  const accounts = await listGoogleAccounts(accessToken);
  const locations = (
    await Promise.all(
      accounts.map((account) => listGoogleLocationsForAccount({ accessToken, account }).catch(() => [])),
    )
  ).flat();

  return {
    accounts,
    locations,
  };
}

async function setGoogleOauthCookie(name: string, value: string, maxAge: number) {
  const cookieStore = await cookies();
  cookieStore.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    maxAge,
    path: "/",
  });
}

async function clearGoogleOauthCookie(name: string) {
  const cookieStore = await cookies();
  cookieStore.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    expires: new Date(0),
    path: "/",
  });
}

async function getGoogleCookieValue(name: string) {
  const cookieStore = await cookies();
  return cookieStore.get(name)?.value ?? null;
}

export async function getGoogleConfiguration(): Promise<GoogleConfiguration> {
  const settings = await getAppSettings();
  const tokenEncryptionKey = await getTokenEncryptionKeyState();
  const clientId = (await getGoogleClientIdSetting()).trim();
  const clientSecret = (await getGoogleClientSecretSetting()).trim();
  const clientSecretSource =
    settings.googleClientSecretConfigured && tokenEncryptionKey.configured && clientSecret
      ? "settings"
      : env.GOOGLE_CLIENT_SECRET
        ? "environment"
        : "missing";
  const publicAppUrl = settings.publicAppUrl || env.APP_URL;
  const redirectUri = buildGoogleRedirectUri(publicAppUrl);
  const missingConfig: string[] = [];

  if (!clientId) {
    missingConfig.push("Google Client ID");
  }

  if (!clientSecret) {
    missingConfig.push("Google Client Secret");
  }

  if (!tokenEncryptionKey.configured) {
    missingConfig.push("Token encryption key");
  }

  return {
    clientId,
    clientSecretConfigured: Boolean(clientSecret),
    clientSecretSource,
    tokenEncryptionKeyConfigured: tokenEncryptionKey.configured,
    tokenEncryptionKeySource: tokenEncryptionKey.source,
    redirectUri,
    requiredScopes: [...GOOGLE_REQUIRED_OAUTH_SCOPES],
    missingConfig,
    publicAppUrl,
  };
}

export async function beginGoogleOauth(input: { mode: GoogleOauthMode; publicAppUrlOverride?: string }) {
  const config = await getGoogleConfiguration();

  if (config.missingConfig.length > 0) {
    throw new Error(`Google setup is incomplete: ${config.missingConfig.join(", ")}.`);
  }

  const state = randomBytes(24).toString("base64url");
  await setGoogleOauthCookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, state, GOOGLE_STATE_MAX_AGE_SECONDS);
  await setGoogleOauthCookie(GOOGLE_OAUTH_MODE_COOKIE_NAME, input.mode, GOOGLE_STATE_MAX_AGE_SECONDS);

  return buildGoogleOAuthAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: input.publicAppUrlOverride ? buildGoogleRedirectUri(input.publicAppUrlOverride) : config.redirectUri,
    state,
  });
}

export async function consumeGoogleOauthState(input: { state: string | null }) {
  const [expectedState, mode] = await Promise.all([
    getGoogleCookieValue(GOOGLE_OAUTH_STATE_COOKIE_NAME),
    getGoogleCookieValue(GOOGLE_OAUTH_MODE_COOKIE_NAME),
  ]);

  await Promise.all([
    clearGoogleOauthCookie(GOOGLE_OAUTH_STATE_COOKIE_NAME),
    clearGoogleOauthCookie(GOOGLE_OAUTH_MODE_COOKIE_NAME),
  ]);

  if (!input.state || !expectedState || input.state !== expectedState) {
    throw new Error("Google OAuth state could not be validated.");
  }

  return (mode === "reconnect" ? "reconnect" : "connect") as GoogleOauthMode;
}

export async function exchangeGoogleAuthorizationCode(code: string, input?: { publicAppUrlOverride?: string }) {
  const config = await getGoogleConfiguration();
  const clientSecret = await getGoogleClientSecretSetting();
  const redirectUri = input?.publicAppUrlOverride
    ? buildGoogleRedirectUri(input.publicAppUrlOverride)
    : config.redirectUri;
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const payload = await googleTokenRequest(body);
  const scopes = payload.scope?.split(/\s+/).filter(Boolean) ?? [...GOOGLE_OAUTH_SCOPES];

  if (!payload.refresh_token) {
    throw new Error("Google did not return a refresh token. Reconnect and approve offline access again.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenExpiresAt:
      typeof payload.expires_in === "number" ? new Date(Date.now() + payload.expires_in * 1000) : null,
    scopes,
  };
}

export async function getPendingGoogleLocationSelection() {
  const value = await getGoogleCookieValue(GOOGLE_PENDING_SELECTION_COOKIE_NAME);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as PendingGoogleLocationSelection;
  } catch {
    return null;
  }
}

export async function clearPendingGoogleLocationSelection() {
  await clearGoogleOauthCookie(GOOGLE_PENDING_SELECTION_COOKIE_NAME);
}

export async function setPendingGoogleLocationSelection(input: PendingGoogleLocationSelection) {
  await setGoogleOauthCookie(
    GOOGLE_PENDING_SELECTION_COOKIE_NAME,
    JSON.stringify(input),
    GOOGLE_STATE_MAX_AGE_SECONDS,
  );
}

async function updateGoogleConnectionStatus(input: {
  connectionId: string;
  status: ConnectedAccountStatus;
  lastError?: string | null;
  tokenExpiresAt?: Date | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  metadata?: Prisma.InputJsonValue;
  lastTestedAt?: Date | null;
  lastSuccessfulTestAt?: Date | null;
  lastFailedTestAt?: Date | null;
}) {
  return prisma.connectedAccount.update({
    where: { id: input.connectionId },
    data: {
      status: input.status,
      lastError: input.lastError ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? undefined,
      accessTokenEncrypted:
        input.accessToken !== undefined
          ? input.accessToken
            ? await encryptValue(input.accessToken)
            : null
          : undefined,
      refreshTokenEncrypted:
        input.refreshToken !== undefined
          ? input.refreshToken
            ? await encryptValue(input.refreshToken)
            : null
          : undefined,
      metadata: input.metadata ?? undefined,
      lastTestedAt: input.lastTestedAt ?? undefined,
      lastSuccessfulTestAt: input.lastSuccessfulTestAt ?? undefined,
      lastFailedTestAt: input.lastFailedTestAt ?? undefined,
    },
  });
}

export async function saveGoogleConnectedLocation(input: {
  mode: GoogleOauthMode;
  userProfile: {
    sub: string;
    email: string | null;
    name: string | null;
    picture: string | null;
  };
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date | null;
  scopes: string[];
  location: GoogleLocationResource;
}) {
  const metadata = buildGoogleConnectionMetadata({
    accountEmail: input.userProfile.email,
    accountDisplayName: input.userProfile.name,
    accountProfilePictureUrl: input.userProfile.picture,
    accountResourceName: input.location.accountResourceName,
    locationResourceName: input.location.locationResourceName,
    localPostParent: input.location.localPostParent,
    storeCode: input.location.storeCode,
    lastTokenRefreshAt: new Date().toISOString(),
    lastPublishAt: null,
    lastPublishPostId: null,
    lastPublishError: null,
    lastPublishAttemptId: null,
  });

  const connection = await prisma.connectedAccount.upsert({
    where: {
      platform: SocialPlatform.GOOGLE_BUSINESS,
    },
    update: {
      accountName: input.userProfile.email || input.userProfile.name || "Google account",
      accountId: input.userProfile.sub,
      pageId: input.location.locationId,
      pageName: input.location.title,
      accessTokenEncrypted: await encryptValue(input.accessToken),
      refreshTokenEncrypted: await encryptValue(input.refreshToken),
      tokenExpiresAt: input.tokenExpiresAt,
      scopes: input.scopes,
      status: ConnectedAccountStatus.CONNECTED,
      lastError: null,
      metadata,
    },
    create: {
      platform: SocialPlatform.GOOGLE_BUSINESS,
      accountName: input.userProfile.email || input.userProfile.name || "Google account",
      accountId: input.userProfile.sub,
      pageId: input.location.locationId,
      pageName: input.location.title,
      accessTokenEncrypted: await encryptValue(input.accessToken),
      refreshTokenEncrypted: await encryptValue(input.refreshToken),
      tokenExpiresAt: input.tokenExpiresAt,
      scopes: input.scopes,
      status: ConnectedAccountStatus.CONNECTED,
      metadata,
    },
  });

  await dismissProviderNotifications({
    provider: SocialPlatform.GOOGLE_BUSINESS,
    types: [NotificationType.TOKEN_EXPIRED, NotificationType.TOKEN_INVALID, NotificationType.MISSING_SCOPE, NotificationType.PUBLISH_FAILED, NotificationType.INFO],
  });

  return connection;
}

export async function getGoogleConnectionRecord(): Promise<GoogleConnectionRecord | null> {
  const connection = await prisma.connectedAccount.findUnique({
    where: {
      platform: SocialPlatform.GOOGLE_BUSINESS,
    },
  });

  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    platform: connection.platform,
    accountName: connection.accountName,
    accountId: connection.accountId,
    locationId: connection.pageId,
    locationName: connection.pageName,
    tokenExpiresAt: connection.tokenExpiresAt,
    scopes: normalizeScopes(connection.scopes),
    status: connection.status,
    lastTestedAt: connection.lastTestedAt,
    lastSuccessfulTestAt: connection.lastSuccessfulTestAt,
    lastFailedTestAt: connection.lastFailedTestAt,
    lastError: connection.lastError,
    metadata: connection.metadata,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export async function getGoogleConnection(): Promise<GoogleConnection | null> {
  const connection = await prisma.connectedAccount.findUnique({
    where: {
      platform: SocialPlatform.GOOGLE_BUSINESS,
    },
  });

  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    platform: connection.platform,
    accountName: connection.accountName,
    accountId: connection.accountId,
    locationId: connection.pageId,
    locationName: connection.pageName,
    tokenExpiresAt: connection.tokenExpiresAt,
    scopes: normalizeScopes(connection.scopes),
    status: connection.status,
    lastTestedAt: connection.lastTestedAt,
    lastSuccessfulTestAt: connection.lastSuccessfulTestAt,
    lastFailedTestAt: connection.lastFailedTestAt,
    lastError: connection.lastError,
    metadata: connection.metadata,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    accessToken: connection.accessTokenEncrypted ? await decryptValue(connection.accessTokenEncrypted) : "",
    refreshToken: connection.refreshTokenEncrypted ? await decryptValue(connection.refreshTokenEncrypted) : null,
  };
}

function getMissingGoogleScopes(scopes: string[]) {
  return GOOGLE_REQUIRED_OAUTH_SCOPES.filter((scope) => !scopes.includes(scope));
}

async function refreshGoogleAccessToken(connection: GoogleConnection) {
  if (!connection.refreshToken) {
    throw new Error("Google needs to be reconnected before posting.");
  }

  const config = await getGoogleConfiguration();
  const clientSecret = await getGoogleClientSecretSetting();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token",
  });

  const payload = await googleTokenRequest(body);
  const expiresAt =
    typeof payload.expires_in === "number" ? new Date(Date.now() + payload.expires_in * 1000) : connection.tokenExpiresAt;
  const metadata = buildGoogleConnectionMetadata({
    existingMetadata: connection.metadata,
    lastTokenRefreshAt: new Date().toISOString(),
  });

  const updated = await updateGoogleConnectionStatus({
    connectionId: connection.id,
    status: ConnectedAccountStatus.CONNECTED,
    accessToken: payload.access_token,
    refreshToken: connection.refreshToken,
    tokenExpiresAt: expiresAt,
    metadata,
  });

  return {
    ...connection,
    accessToken: payload.access_token,
    tokenExpiresAt: updated.tokenExpiresAt,
    metadata: updated.metadata,
  };
}

async function getHealthyGoogleConnection(source: string) {
  const refreshed = await refreshGoogleConnectionHealth({
    createNotification: true,
    source,
  });

  if (!refreshed || refreshed.status !== ConnectedAccountStatus.CONNECTED) {
    throw new Error("Google needs to be reconnected before posting.");
  }

  const connection = await getGoogleConnection();
  if (!connection) {
    throw new Error("Google needs to be reconnected before posting.");
  }

  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
    return refreshGoogleAccessToken(connection);
  }

  return connection;
}

export async function testGoogleConnection() {
  const connection = await getHealthyGoogleConnection("manual_test");
  if (!connection.locationId) {
    throw new Error("No Google Business Profile location is connected.");
  }

  const response = await googleApiJson<{
    name?: string;
    title?: string;
  }>({
    url: `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${connection.locationId}?readMask=name,title`,
    accessToken: connection.accessToken,
  });

  const testedAt = new Date();
  await updateGoogleConnectionStatus({
    connectionId: connection.id,
    status: ConnectedAccountStatus.CONNECTED,
    lastError: null,
    lastTestedAt: testedAt,
    lastSuccessfulTestAt: testedAt,
  });

  return {
    locationId: connection.locationId,
    locationName: response.title || connection.locationName || connection.locationId,
    testedAt,
  } satisfies GoogleConnectionTestResult;
}

export async function disconnectGoogleConnection() {
  const connection = await prisma.connectedAccount.findUnique({
    where: {
      platform: SocialPlatform.GOOGLE_BUSINESS,
    },
  });

  if (!connection) {
    return null;
  }

  await prisma.connectedAccount.update({
    where: { id: connection.id },
    data: {
      status: ConnectedAccountStatus.DISCONNECTED,
      lastError: "Disconnected by admin.",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      scopes: Prisma.JsonNull,
    },
  });

  await createOrUpdateGoogleDisconnectedNotification();
  return connection;
}

export async function refreshGoogleConnectionHealth(input?: {
  createNotification?: boolean;
  source?: string;
}) {
  const connection = await getGoogleConnection();
  if (!connection) {
    return null;
  }

  const missingScopes = getMissingGoogleScopes(connection.scopes);
  if (missingScopes.length > 0) {
    const status = ConnectedAccountStatus.MISSING_SCOPES;
    const message = `Reconnect Google Business and approve: ${missingScopes.join(", ")}.`;
    await updateGoogleConnectionStatus({
      connectionId: connection.id,
      status,
      lastError: message,
      lastFailedTestAt: new Date(),
      lastTestedAt: new Date(),
    });
    if (input?.createNotification !== false) {
      await createOrUpdateGoogleTokenNotification({
        provider: SocialPlatform.GOOGLE_BUSINESS,
        status: "missing_scopes",
        detail: message,
      });
    }
    return {
      status,
      message,
    };
  }

  if (!connection.refreshToken) {
    const status = ConnectedAccountStatus.NEEDS_RECONNECT;
    const message = "Google needs to be reconnected before posting.";
    await updateGoogleConnectionStatus({
      connectionId: connection.id,
      status,
      lastError: message,
      lastFailedTestAt: new Date(),
      lastTestedAt: new Date(),
    });
    if (input?.createNotification !== false) {
      await createOrUpdateGoogleTokenNotification({
        provider: SocialPlatform.GOOGLE_BUSINESS,
        status: "invalid",
        detail: message,
      });
    }
    return {
      status,
      message,
    };
  }

  try {
    const activeConnection =
      !connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() <= Date.now() + 60_000
        ? await refreshGoogleAccessToken(connection)
        : connection;

    if (!activeConnection.locationId) {
      throw new Error("No Google Business Profile location is connected.");
    }

    const [profile, location] = await Promise.all([
      getGoogleUserProfileIfAvailable({
        accessToken: activeConnection.accessToken,
        scopes: activeConnection.scopes,
      }),
      googleApiJson<{
        name?: string;
        title?: string;
      }>({
        url: `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${activeConnection.locationId}?readMask=name,title`,
        accessToken: activeConnection.accessToken,
      }),
    ]);

    const testedAt = new Date();
    await updateGoogleConnectionStatus({
      connectionId: activeConnection.id,
      status: ConnectedAccountStatus.CONNECTED,
      lastError: null,
      lastTestedAt: testedAt,
      lastSuccessfulTestAt: testedAt,
      metadata: buildGoogleConnectionMetadata({
        existingMetadata: activeConnection.metadata,
        accountEmail: profile?.email,
        accountDisplayName: profile?.name,
        accountProfilePictureUrl: profile?.picture,
      }),
    });

    if (location.title && location.title !== activeConnection.locationName) {
      await prisma.connectedAccount.update({
        where: { id: activeConnection.id },
        data: {
          pageName: location.title,
        },
      });
    }

    if (input?.createNotification !== false) {
      await dismissProviderNotifications({
        provider: SocialPlatform.GOOGLE_BUSINESS,
        types: [NotificationType.TOKEN_EXPIRED, NotificationType.TOKEN_INVALID, NotificationType.MISSING_SCOPE],
      });
    }

    return {
      status: ConnectedAccountStatus.CONNECTED,
      message: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google connection health check failed.";
    const isExpired = /expired|invalid_grant|unauthorized/i.test(message);
    const status = isExpired ? ConnectedAccountStatus.EXPIRED : ConnectedAccountStatus.ERROR;
    await updateGoogleConnectionStatus({
      connectionId: connection.id,
      status,
      lastError: message,
      lastFailedTestAt: new Date(),
      lastTestedAt: new Date(),
    });

    await createAuditLog({
      action: AUDIT_ACTIONS.GOOGLE_TOKEN_HEALTH_CHECK_FAILED,
      targetType: "ConnectedAccount",
      targetId: connection.id,
      metadata: {
        source: input?.source ?? "unknown",
        message,
      },
    }).catch(() => undefined);

    if (input?.createNotification !== false) {
      await createOrUpdateGoogleTokenNotification({
        provider: SocialPlatform.GOOGLE_BUSINESS,
        status: isExpired ? "expired" : "invalid",
        detail: message,
      });
    }

    return {
      status,
      message,
    };
  }
}

export async function getGoogleDiagnostics(input?: { refreshHealth?: boolean }) {
  if (input?.refreshHealth !== false) {
    await refreshGoogleConnectionHealth({
      createNotification: true,
      source: "settings_page_load",
    }).catch(() => null);
  }

  const [configuration, connection] = await Promise.all([
    getGoogleConfiguration(),
    getGoogleConnectionRecord(),
  ]);
  const metadata = normalizeGoogleConnectionMetadata(connection?.metadata ?? null);
  const missingScopes = getMissingGoogleScopes(connection?.scopes ?? []);

  return {
    configuration,
    connection,
    tokenStatus: {
      hasRefreshToken: Boolean((await getGoogleConnection())?.refreshToken),
      expiresAt: connection?.tokenExpiresAt?.toISOString() ?? null,
      missingScopes,
    },
    location: {
      id: connection?.locationId ?? null,
      name: connection?.locationName ?? null,
      accountName: connection?.accountName ?? null,
      accountEmail: metadata.accountEmail,
      accountProfilePictureUrl: metadata.accountProfilePictureUrl,
    },
    lastTest: {
      success: connection?.status === ConnectedAccountStatus.CONNECTED,
      testedAt: connection?.lastTestedAt?.toISOString() ?? null,
      message: connection?.lastError || (connection ? "Google connection is ready." : "Google is not connected yet."),
    },
    lastPublish: {
      at: metadata.lastPublishAt,
      postId: metadata.lastPublishPostId,
      lastError: metadata.lastPublishError,
    },
  } satisfies GoogleDiagnosticsResult;
}

export async function getGoogleFoundationState(input?: { refreshHealth?: boolean }) {
  const developerSettings = await getDeveloperSettings();
  if (developerSettings.google) {
    return {
      status: "READY",
      locationId: "dev-override-google",
      locationName: "Developer Override",
      accountName: "Developer Override",
      accountEmail: null,
      accountProfilePictureUrl: null,
      lastCheckedAt: new Date().toISOString(),
      isSelectableInComposer: true,
      message: "Developer override enabled. Google Business is unlocked for composer testing without a live login.",
    } satisfies GoogleFoundationState;
  }

  const diagnostics = await getGoogleDiagnostics({
    refreshHealth: input?.refreshHealth ?? true,
  });

  if (
    diagnostics.connection?.status === ConnectedAccountStatus.CONNECTED &&
    diagnostics.location.id &&
    diagnostics.location.name
  ) {
    return {
      status: "READY",
      locationId: diagnostics.location.id,
      locationName: diagnostics.location.name,
      accountName: diagnostics.location.accountName,
      accountEmail: diagnostics.location.accountEmail,
      accountProfilePictureUrl: diagnostics.location.accountProfilePictureUrl,
      lastCheckedAt: diagnostics.lastTest.testedAt,
      isSelectableInComposer: true,
      message: "Google Business Profile is connected and ready to post.",
    } satisfies GoogleFoundationState;
  }

  if (diagnostics.connection) {
    return {
      status: "NEEDS_RECONNECT",
      locationId: diagnostics.location.id,
      locationName: diagnostics.location.name,
      accountName: diagnostics.location.accountName,
      accountEmail: diagnostics.location.accountEmail,
      accountProfilePictureUrl: diagnostics.location.accountProfilePictureUrl,
      lastCheckedAt: diagnostics.lastTest.testedAt,
      isSelectableInComposer: false,
      message:
        diagnostics.connection.lastError ||
        "Reconnect Google Business and select a Business Profile location before posting.",
    } satisfies GoogleFoundationState;
  }

  return {
    status: "NOT_CONNECTED",
    locationId: null,
    locationName: null,
    accountName: null,
    accountEmail: null,
    accountProfilePictureUrl: null,
    lastCheckedAt: null,
    isSelectableInComposer: false,
    message: "Connect Google Business and choose a Business Profile location before posting.",
  } satisfies GoogleFoundationState;
}

export async function validateGooglePublishPrerequisites(input: {
  caption: string;
  mediaAsset:
    | {
        id: string;
        mimeType: string;
        storagePath: string;
      }
    | null
    | undefined;
}) {
  const caption = input.caption.trim();
  if (!caption) {
    throw new Error("Caption is required before posting to Google Business.");
  }

  const foundation = await getGoogleFoundationState({ refreshHealth: true });
  if (foundation.status !== "READY") {
    throw new Error(foundation.message);
  }

  return {
    caption,
    mediaAsset: input.mediaAsset ?? null,
  };
}

export async function buildGooglePendingSelectionFromCodeExchange(input: {
  mode: GoogleOauthMode;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date | null;
  scopes: string[];
}) {
  const [userProfile, discovery] = await Promise.all([
    getGoogleUserProfileIfAvailable({
      accessToken: input.accessToken,
      scopes: input.scopes,
    }),
    discoverGoogleLocations(input.accessToken),
  ]);

  if (discovery.locations.length === 0) {
    throw new Error("No Google Business Profile locations were returned for this account.");
  }

  return {
    mode: input.mode,
    userProfile: {
      sub: userProfile?.sub || discovery.locations[0]?.accountResourceName || "google-business-account",
      email: userProfile?.email ?? null,
      name: userProfile?.name ?? null,
      picture: userProfile?.picture ?? null,
    },
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tokenExpiresAt: input.tokenExpiresAt?.toISOString() ?? null,
    scopes: input.scopes,
    locations: discovery.locations,
  } satisfies PendingGoogleLocationSelection;
}

export async function connectGoogleSelectedLocation(locationName: string) {
  const pending = await getPendingGoogleLocationSelection();
  if (!pending) {
    throw new Error("The pending Google location selection expired. Connect again and choose the location one more time.");
  }

  const location = pending.locations.find((entry) => entry.locationResourceName === locationName);
  if (!location) {
    throw new Error("The selected Google location is no longer available in this connection flow.");
  }

  const connection = await saveGoogleConnectedLocation({
    mode: pending.mode,
    userProfile: pending.userProfile,
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    tokenExpiresAt: pending.tokenExpiresAt ? new Date(pending.tokenExpiresAt) : null,
    scopes: pending.scopes,
    location,
  });

  await clearPendingGoogleLocationSelection();
  return {
    connection,
    location,
    mode: pending.mode,
  };
}

async function buildGoogleLocalPostBody(input: {
  caption: string;
  publicImageUrl: string | null;
}) {
  return {
    summary: input.caption,
    languageCode: "en-US",
    topicType: "STANDARD",
    ...(input.publicImageUrl
      ? {
          media: [
            {
              mediaFormat: "PHOTO",
              sourceUrl: input.publicImageUrl,
            },
          ],
        }
      : {}),
  } satisfies Prisma.InputJsonObject;
}

function appendGoogleTempDiagnostics(input: {
  responseSummary: Prisma.InputJsonValue | null | undefined;
  temporaryImage: TemporaryPlatformImage | null;
  cleanupResult: TemporaryMediaCleanupResult | null;
}) {
  const base =
    input.responseSummary && typeof input.responseSummary === "object" && !Array.isArray(input.responseSummary)
      ? { ...(input.responseSummary as Prisma.InputJsonObject) }
      : {};

  return {
    ...base,
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

export async function publishGoogleBusinessPost(input: {
  caption: string;
  mediaAsset:
    | {
        id: string;
        mimeType: string;
        storagePath: string;
      }
    | null
    | undefined;
}) {
  const connection = await getHealthyGoogleConnection("publish");
  const metadata = normalizeGoogleConnectionMetadata(connection.metadata);

  if (!metadata.localPostParent || !connection.locationId || !connection.locationName) {
    throw new Error("Reconnect Google Business and choose a Business Profile location before posting.");
  }

  let temporaryImage: TemporaryPlatformImage | null = null;
  let cleanupResult: TemporaryMediaCleanupResult | null = null;

  try {
    let publicImageUrl: string | null = null;

    if (input.mediaAsset) {
      temporaryImage = await generateTemporaryPlatformImage({
        mediaAsset: input.mediaAsset,
        platform: "GOOGLE_BUSINESS",
      });
      publicImageUrl = await createSignedPublicPlatformMediaUrl({
        platform: "GOOGLE_BUSINESS",
        storagePath: temporaryImage.storagePath,
      });
    }

    const requestBody = await buildGoogleLocalPostBody({
      caption: input.caption.trim(),
      publicImageUrl,
    });

    const response = await googleApiJson<{
      name?: string;
      searchUrl?: string;
      summary?: string;
      topicType?: string;
      state?: string;
      media?: unknown[];
    }>({
      url: `https://mybusiness.googleapis.com/v4/${metadata.localPostParent}/localPosts`,
      accessToken: connection.accessToken,
      method: "POST",
      body: requestBody,
    });

    const finishedAt = new Date().toISOString();
    const nextMetadata = buildGoogleConnectionMetadata({
      existingMetadata: connection.metadata,
      lastPublishAt: finishedAt,
      lastPublishPostId: response.name ?? null,
      lastPublishError: null,
    });
    await updateGoogleConnectionStatus({
      connectionId: connection.id,
      status: ConnectedAccountStatus.CONNECTED,
      metadata: nextMetadata,
    });

    return {
      platformPostId: response.name || `${metadata.localPostParent}/localPosts`,
      platformPostUrl: typeof response.searchUrl === "string" ? response.searchUrl : null,
      responseSummary: appendGoogleTempDiagnostics({
        responseSummary: {
          endpoint: "localPosts.create",
          locationId: connection.locationId,
          locationName: connection.locationName,
          localPostName: response.name ?? null,
          localPostUrl: typeof response.searchUrl === "string" ? response.searchUrl : null,
          requestSummary: requestBody,
        } satisfies Prisma.InputJsonObject,
        temporaryImage,
        cleanupResult,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Business publishing failed.";
    const nextMetadata = buildGoogleConnectionMetadata({
      existingMetadata: connection.metadata,
      lastPublishError: message,
    });
    await updateGoogleConnectionStatus({
      connectionId: connection.id,
      status: connection.status,
      metadata: nextMetadata,
      lastError: message,
    }).catch(() => undefined);
    throw new Error(message);
  } finally {
    if (temporaryImage) {
      cleanupResult = await cleanupTemporaryPlatformImage(temporaryImage.absolutePath);
    }
  }
}

export async function claimGooglePostForPublishing(input: {
  socialPostId: string;
  allowedStatuses: SocialPostStatus[];
}) {
  return prisma.$transaction(async (tx) => {
    const platformRecord = await tx.socialPostPlatform.findUnique({
      where: {
        socialPostId_platform: {
          socialPostId: input.socialPostId,
          platform: SocialPlatform.GOOGLE_BUSINESS,
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
          },
        },
      },
    });

    if (!platformRecord || !input.allowedStatuses.includes(platformRecord.status)) {
      return {
        ok: false as const,
        reason: "INVALID_STATUS" as const,
        message: "This Google Business post is not in a publishable state.",
      };
    }

    if (
      platformRecord.platformPostId ||
      platformRecord.publishedAt ||
      platformRecord.status === SocialPostStatus.PUBLISHED
    ) {
      return {
        ok: false as const,
        reason: "ALREADY_PUBLISHED" as const,
        message: "This Google Business post was already published and cannot be published again.",
      };
    }

    const runningAttempt = await tx.publishAttempt.findFirst({
      where: {
        socialPostId: input.socialPostId,
        platform: SocialPlatform.GOOGLE_BUSINESS,
        status: PublishAttemptStatus.PENDING,
        finishedAt: null,
      },
      select: { id: true },
    });

    if (runningAttempt) {
      return {
        ok: false as const,
        reason: "ALREADY_RUNNING" as const,
        message: "A Google Business publish attempt is already running for this post.",
      };
    }

    const platformClaim = await tx.socialPostPlatform.updateMany({
      where: {
        id: platformRecord.id,
        status: {
          in: input.allowedStatuses,
        },
        platformPostId: null,
        publishedAt: null,
      },
      data: {
        status: SocialPostStatus.PUBLISHING,
        lastError: null,
      },
    });

    if (platformClaim.count !== 1) {
      return {
        ok: false as const,
        reason: "CLAIM_CONFLICT" as const,
        message: "Another publish action already claimed this Google Business post.",
      };
    }

    await tx.socialPost.update({
      where: {
        id: input.socialPostId,
      },
      data: {
        status: SocialPostStatus.PUBLISHING,
        publishedAt: null,
        failureReason: null,
      },
    });

    return {
      ok: true as const,
      socialPostId: input.socialPostId,
      socialPostPlatformId: platformRecord.id,
    };
  });
}

export async function executeGooglePublish(input: {
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
          mediaAsset: true,
          attachedMedia: {
            orderBy: {
              position: "asc",
            },
            include: {
              mediaAsset: true,
            },
          },
        },
      },
    },
  });

  if (!platformRecord || platformRecord.socialPostId !== input.socialPostId) {
    throw new Error("Google Business platform record not found.");
  }

  const primaryMediaAsset = platformRecord.socialPost.attachedMedia[0]?.mediaAsset ?? platformRecord.socialPost.mediaAsset;
  const [businessVariables, hashtagSettings] = await Promise.all([
    getBusinessVariableSettings(),
    getHashtagSettings(),
  ]);
  const renderedDescription = resolveRenderedPlatformContent(
    platformRecord.socialPost,
    SocialPlatform.GOOGLE_BUSINESS,
    businessVariables,
    hashtagSettings,
  );
  const attempt = await prisma.publishAttempt.create({
    data: {
      socialPostId: platformRecord.socialPostId,
        socialPostPlatformId: platformRecord.id,
        platform: SocialPlatform.GOOGLE_BUSINESS,
        status: PublishAttemptStatus.PENDING,
        requestSummary: {
          captionLength: renderedDescription.descriptionText.length,
          hasMedia: Boolean(primaryMediaAsset),
          mediaAssetId: primaryMediaAsset?.id ?? null,
          platform: SocialPlatform.GOOGLE_BUSINESS,
          usedOverride: renderedDescription.usedOverride,
          effectiveDescriptionLength: renderedDescription.descriptionText.length,
          variablesRendered: renderedDescription.variablesRendered,
          unresolvedVariablesCount: renderedDescription.unresolvedVariableNames.length,
          unresolvedVariableNames: renderedDescription.unresolvedVariableNames,
          hashtagCount: renderedDescription.hashtagsUsed.length,
          hashtagPlacement: renderedDescription.hashtagPlacement,
        },
        startedAt: new Date(),
      },
    });

    try {
      if (renderedDescription.unresolvedVariableNames.length > 0) {
        throw new Error(
          `These variables are missing values: ${renderedDescription.unresolvedVariableNames.map((name) => `{{${name}}}`).join(", ")}`,
        );
      }
      const result = await publishGoogleBusinessPost({
        caption: renderedDescription.descriptionText,
        mediaAsset: primaryMediaAsset,
      });
    const finishedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.publishAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PublishAttemptStatus.SUCCEEDED,
          responseSummary: result.responseSummary,
          platformPostId: result.platformPostId,
          platformPostUrl: result.platformPostUrl,
          finishedAt,
        },
      });
      await tx.socialPostPlatform.update({
        where: { id: platformRecord.id },
        data: {
          status: SocialPostStatus.PUBLISHED,
          publishedAt: finishedAt,
          platformPostId: result.platformPostId,
          platformPostUrl: result.platformPostUrl,
          lastError: null,
        },
      });
      await syncSocialPostAggregateState(tx, platformRecord.socialPostId);
    });

    return {
      attemptId: attempt.id,
      result,
      finishedAt,
      status: SocialPostStatus.PUBLISHED,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "Google Business publishing failed.";

    await prisma.$transaction(async (tx) => {
      await tx.publishAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PublishAttemptStatus.FAILED,
          errorCode: "GOOGLE_PUBLISH_FAILED",
          errorMessage: message,
          finishedAt,
        },
      });
      await tx.socialPostPlatform.update({
        where: { id: platformRecord.id },
        data: {
          status: SocialPostStatus.FAILED,
          lastError: message,
        },
      });
      await syncSocialPostAggregateState(tx, platformRecord.socialPostId, {
        failureReason: message,
      });
    });

    await createOrUpdateGooglePublishFailedNotification({
      postId: platformRecord.socialPostId,
      message: "Google Business posting failed.",
      detail: message,
    }).catch(() => undefined);

    throw new Error(message);
  }
}

export async function storeGoogleDiagnosticsSnapshot(result: GoogleDiagnosticsResult) {
  await upsertAppSetting(APP_SETTING_KEYS.GOOGLE_DIAGNOSTIC_SNAPSHOT, JSON.stringify(result));
}

export async function getStoredGoogleDiagnosticsSnapshot() {
  const value = await getAppSettingValue(APP_SETTING_KEYS.GOOGLE_DIAGNOSTIC_SNAPSHOT);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as GoogleDiagnosticsResult;
  } catch {
    return null;
  }
}
