import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { cookies } from "next/headers";
import {
  ConnectedAccountStatus,
  Prisma,
  PublishAttemptStatus,
  SocialPlatform,
  SocialPostStatus,
  type ConnectedAccount,
} from "@prisma/client";
import { env, hasTokenEncryptionKeyConfigured, isProduction } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { ensureSafeAbsolutePath, resolveUploadBasePath } from "@/lib/uploads";

export const FACEBOOK_GRAPH_VERSION = "v23.0";
export const FACEBOOK_REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
] as const;

export const FACEBOOK_OAUTH_STATE_COOKIE_NAME = "smm_facebook_oauth_state";
export const FACEBOOK_PENDING_SELECTION_COOKIE_NAME = "smm_facebook_pending_selection";
const FACEBOOK_STATE_MAX_AGE_SECONDS = 10 * 60;
const FACEBOOK_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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

type PendingFacebookPageSelection = {
  accountId: string;
  accountName: string;
  pages: FacebookManagedPage[];
  scopes: string[];
  tokenExpiresAt: string | null;
};

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
  redirectUri: string;
  requiredScopes: string[];
  missingConfig: string[];
  publicAppUrl: string;
  checks: FacebookRuntimeCheck[];
};

export type FacebookConnectionTestResult = {
  pageId: string;
  pageName: string;
  pageUrl: string | null;
  testedAt: Date;
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

function getFacebookPublishVariant(
  mediaAsset:
    | {
        variants?: Array<{
          id: string;
          variantType: "ORIGINAL" | "FACEBOOK_FEED" | "GOOGLE_BUSINESS_SAFE" | "INSTAGRAM_FEED_PLACEHOLDER";
          storagePath: string;
          mimeType: string;
          width: number;
          height: number;
        }>;
      }
    | null
    | undefined,
) {
  return mediaAsset?.variants?.find((variant) => variant.variantType === "FACEBOOK_FEED") ?? null;
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

export async function getFacebookConfiguration(): Promise<FacebookConfiguration> {
  const settings = await getAppSettings();
  const appId = (settings.facebookAppId || env.FACEBOOK_APP_ID || "").trim();
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
      configured: Boolean(env.FACEBOOK_APP_SECRET),
      detail: env.FACEBOOK_APP_SECRET ? "Configured in environment" : "Missing",
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

  if (!env.FACEBOOK_APP_SECRET) {
    missingConfig.push("FACEBOOK_APP_SECRET");
  }

  if (!hasTokenEncryptionKeyConfigured) {
    missingConfig.push("TOKEN_ENCRYPTION_KEY");
  }

  return {
    appId,
    redirectUri,
    requiredScopes: [...FACEBOOK_REQUIRED_SCOPES],
    missingConfig,
    publicAppUrl,
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

export async function buildFacebookConnectUrl() {
  const config = await getFacebookConfiguration();
  const state = await createFacebookOauthState();
  const url = new URL(`https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", config.requiredScopes.join(","));
  url.searchParams.set("response_type", "code");

  return url.toString();
}

export async function createFacebookOauthState() {
  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(FACEBOOK_OAUTH_STATE_COOKIE_NAME, state, {
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

    return parsed;
  } catch {
    return null;
  }
}

async function exchangeCodeForUserToken(input: { code: string; redirectUri: string; appId: string }) {
  const url = buildFacebookGraphUrl("/oauth/access_token", {
    client_id: input.appId,
    client_secret: env.FACEBOOK_APP_SECRET,
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
  const url = buildFacebookGraphUrl("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: input.appId,
    client_secret: env.FACEBOOK_APP_SECRET,
    fb_exchange_token: input.accessToken,
  });

  return facebookGraphRequestJson<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(url, { method: "GET" });
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

async function fetchManagedFacebookPages(userAccessToken: string) {
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
    .filter((page) => page.id && page.name && page.access_token)
    .map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token,
      link: page.link ?? null,
      tasks: page.tasks ?? [],
    }));
}

export async function getFacebookOauthCallbackData(input: { code: string }) {
  const config = await getFacebookConfiguration();
  const shortLivedToken = await exchangeCodeForUserToken({
    code: input.code,
    redirectUri: config.redirectUri,
    appId: config.appId,
  });
  const longLivedToken = await exchangeForLongLivedUserToken({
    accessToken: shortLivedToken.access_token,
    appId: config.appId,
  });
  const [profile, pages] = await Promise.all([
    fetchFacebookUserProfile(longLivedToken.access_token),
    fetchManagedFacebookPages(longLivedToken.access_token),
  ]);

  return {
    accountId: profile.id,
    accountName: profile.name,
    pages,
    scopes: [...config.requiredScopes],
    tokenExpiresAt: longLivedToken.expires_in
      ? new Date(Date.now() + longLivedToken.expires_in * 1000)
      : null,
  };
}

export async function saveFacebookConnectedPage(input: {
  accountId: string;
  accountName: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  pageUrl?: string | null;
  scopes: string[];
  tokenExpiresAt?: Date | null;
}) {
  return prisma.connectedAccount.upsert({
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
      lastError: null,
      metadata: input.pageUrl
        ? {
            pageUrl: input.pageUrl,
          }
        : undefined,
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
      metadata: input.pageUrl
        ? {
            pageUrl: input.pageUrl,
          }
        : undefined,
    },
  });
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

export async function getFacebookConnection(): Promise<FacebookConnection | null> {
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

export async function disconnectFacebookConnection() {
  const record = await prisma.connectedAccount.findUnique({
    where: {
      platform: SocialPlatform.FACEBOOK,
    },
  });

  if (!record) {
    return null;
  }

  return prisma.connectedAccount.update({
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
      lastError: null,
      metadata: Prisma.JsonNull,
    },
  });
}

export async function testFacebookConnection() {
  const connection = await getFacebookConnection();

  if (!connection) {
    throw new Error("Connect a Facebook Page before testing the connection.");
  }

  try {
    const url = buildFacebookGraphUrl(`/${connection.pageId}`, {
      access_token: connection.accessToken,
      fields: "id,name,link",
    });

    const page = await facebookGraphRequestJson<{
      id: string;
      name: string;
      link?: string;
    }>(url, { method: "GET" });

    const testedAt = new Date();
    await prisma.connectedAccount.update({
      where: {
        platform: SocialPlatform.FACEBOOK,
      },
      data: {
        accountName: page.name || connection.accountName,
        pageName: page.name || connection.pageName,
        status: ConnectedAccountStatus.CONNECTED,
        lastTestedAt: testedAt,
        lastError: null,
        metadata: page.link
          ? {
              pageUrl: page.link,
            }
          : undefined,
      },
    });

    return {
      pageId: page.id,
      pageName: page.name,
      pageUrl: page.link ?? null,
      testedAt,
    } satisfies FacebookConnectionTestResult;
  } catch (error) {
    const normalizedError = handleFacebookApiError(error);

    await prisma.connectedAccount.updateMany({
      where: {
        platform: SocialPlatform.FACEBOOK,
      },
      data: {
        status: ConnectedAccountStatus.ERROR,
        lastTestedAt: new Date(),
        lastError: normalizedError.message,
      },
    });

    throw normalizedError;
  }
}

async function validateFacebookImageVariant(input: {
  storagePath: string;
  mimeType: string;
}) {
  if (input.mimeType !== "image/jpeg") {
    throw new Error("Facebook image publishing requires the generated FACEBOOK_FEED JPEG variant.");
  }

  const settings = await getAppSettings();
  const uploadBasePath = resolveUploadBasePath(settings.uploadDirectory || env.UPLOAD_DIR);
  const absolutePath = ensureSafeAbsolutePath(uploadBasePath, input.storagePath);

  try {
    await access(absolutePath);
  } catch {
    throw new Error("The Facebook image variant file is missing on disk. Re-upload or reprocess the media asset.");
  }

  let fileStats;
  try {
    fileStats = await stat(absolutePath);
  } catch {
    throw new Error("The Facebook image variant could not be inspected on disk.");
  }

  if (!fileStats.isFile()) {
    throw new Error("The Facebook image variant path does not point to a readable file.");
  }

  if (fileStats.size <= 0) {
    throw new Error("The Facebook image variant file is empty.");
  }

  if (fileStats.size > FACEBOOK_MAX_IMAGE_BYTES) {
    throw new Error("The Facebook image variant is too large to publish safely. Reprocess or upload a smaller image.");
  }

  return {
    absolutePath,
    fileSizeBytes: fileStats.size,
  };
}

export async function validateFacebookPublishPrerequisites(input: {
  caption: string;
  mediaAsset:
    | {
        id: string;
        variants?: Array<{
          id: string;
          variantType: "ORIGINAL" | "FACEBOOK_FEED" | "GOOGLE_BUSINESS_SAFE" | "INSTAGRAM_FEED_PLACEHOLDER";
          storagePath: string;
          mimeType: string;
          width: number;
          height: number;
        }>;
      }
    | null
    | undefined;
}) {
  await assertFacebookRuntimeReady();

  const connection = await getFacebookConnection();
  if (!connection?.pageId) {
    throw new Error("Connect a Facebook Page before publishing.");
  }

  const trimmedCaption = input.caption.trim();
  if (!trimmedCaption) {
    throw new Error("Caption is required before publishing to Facebook.");
  }

  const facebookVariant = getFacebookPublishVariant(input.mediaAsset);
  if (input.mediaAsset && !facebookVariant) {
    throw new Error("The selected media asset is missing a FACEBOOK_FEED variant.");
  }

  if (facebookVariant) {
    const validatedFile = await validateFacebookImageVariant({
      storagePath: facebookVariant.storagePath,
      mimeType: facebookVariant.mimeType,
    });

    return {
      connection,
      caption: trimmedCaption,
      facebookVariant,
      validatedFile,
    };
  }

  return {
    connection,
    caption: trimmedCaption,
    facebookVariant: null,
    validatedFile: null,
  };
}

export function buildFacebookPostPayload(input: {
  caption: string;
  mediaAsset:
    | {
        id: string;
        variants?: Array<{
          id: string;
          variantType: "ORIGINAL" | "FACEBOOK_FEED" | "GOOGLE_BUSINESS_SAFE" | "INSTAGRAM_FEED_PLACEHOLDER";
          storagePath: string;
          mimeType: string;
          width: number;
          height: number;
        }>;
      }
    | null
    | undefined;
}) {
  const facebookVariant = getFacebookPublishVariant(input.mediaAsset);

  return {
    kind: facebookVariant ? "image" : "text",
    variantId: facebookVariant?.id ?? null,
    summary: {
      captionLength: input.caption.trim().length,
      hasMedia: Boolean(facebookVariant),
      mediaAssetId: input.mediaAsset?.id ?? null,
      mediaVariantId: facebookVariant?.id ?? null,
      mediaVariantDimensions: facebookVariant ? `${facebookVariant.width}x${facebookVariant.height}` : null,
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
        variants?: Array<{
          id: string;
          variantType: "ORIGINAL" | "FACEBOOK_FEED" | "GOOGLE_BUSINESS_SAFE" | "INSTAGRAM_FEED_PLACEHOLDER";
          storagePath: string;
          mimeType: string;
          width: number;
          height: number;
        }>;
      }
    | null
    | undefined;
}) {
  const payload = buildFacebookPostPayload(input);
  const validation = await validateFacebookPublishPrerequisites(input);

  try {
    const publishResult =
      payload.kind === "image" && validation.facebookVariant && validation.validatedFile
        ? await publishFacebookImagePost({
            accessToken: validation.connection.accessToken,
            pageId: validation.connection.pageId!,
            caption: validation.caption,
            absolutePath: validation.validatedFile.absolutePath,
          })
        : await publishFacebookTextPost({
            accessToken: validation.connection.accessToken,
            pageId: validation.connection.pageId!,
            caption: validation.caption,
          });

    const platformPostUrl = await fetchFacebookPostUrl({
      accessToken: validation.connection.accessToken,
      platformPostId: publishResult.id,
    });

    return {
      platformPostId: publishResult.id,
      platformPostUrl,
      responseSummary: {
        ...publishResult.responseSummary,
        pageId: validation.connection.pageId,
        pageName: validation.connection.pageName,
        platformPostUrl,
      } as Prisma.InputJsonObject,
    } satisfies FacebookPublishResult;
  } catch (error) {
    throw handleFacebookApiError(error);
  }
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

    return "Facebook could not accept the image upload. Confirm the Facebook-ready JPEG exists and try again.";
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
        technicalMessage,
        type: errorPayload.type ?? null,
        subcode: errorPayload.error_subcode ?? null,
        fbtraceId: errorPayload.fbtrace_id ?? null,
      } satisfies Prisma.InputJsonObject,
    });
  }

  return payload;
}
