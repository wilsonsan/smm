import { ConnectedAccountStatus, Prisma, PublishAttemptStatus, SocialPlatform, SocialPostStatus } from "@prisma/client";
import {
  type FacebookConnectionRecord,
  getFacebookConnection,
  getFacebookConnectionRecord,
  handleFacebookApiError,
  refreshFacebookConnectionHealth,
} from "@/lib/facebook";
import { createSignedPublicPlatformMediaUrl } from "@/lib/public-platform-media";
import {
  cleanupTemporaryPlatformImage,
  validateStoredOriginalMediaAsset,
  generateTemporaryPlatformImage,
  type TemporaryPlatformImage,
  type TemporaryMediaCleanupResult,
} from "@/lib/uploads";
import { createOrUpdatePlatformPublishFailedNotification } from "@/lib/notifications";
import {
  resolveRenderedPlatformContent,
} from "@/lib/posts";
import { syncSocialPostAggregateState } from "@/lib/publish-state";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { getBusinessVariableSettings, getDeveloperSettings, getHashtagSettings } from "@/lib/settings";

export const INSTAGRAM_REQUIRED_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_read_engagement",
] as const;

const INSTAGRAM_GRAPH_VERSION = "v23.0";
const INSTAGRAM_CONTAINER_MAX_POLLS = 20;
const INSTAGRAM_CONTAINER_POLL_INTERVAL_MS = 1500;
const INSTAGRAM_FIRST_COMMENT_MAX_ATTEMPTS = 6;
const INSTAGRAM_FIRST_COMMENT_RETRY_DELAY_MS = 2500;

export type InstagramFoundationState = {
  status: "READY" | "NOT_LINKED" | "LOOKUP_ERROR" | "FACEBOOK_DISCONNECTED";
  accountId: string | null;
  username: string | null;
  profilePictureUrl: string | null;
  source: "instagram_business_account" | "connected_instagram_account" | null;
  pageId: string | null;
  pageName: string | null;
  facebookStatus: ConnectedAccountStatus | null;
  lastCheckedAt: string | null;
  errorMessage: string | null;
  isSelectableInComposer: boolean;
  message: string;
};

type ParsedInstagramMetadata = {
  status: "READY" | "NOT_LINKED" | "LOOKUP_ERROR";
  accountId: string | null;
  username: string | null;
  profilePictureUrl: string | null;
  source: "instagram_business_account" | "connected_instagram_account" | null;
  lastCheckedAt: string | null;
  errorMessage: string | null;
};

export type InstagramDiagnosticsResult = {
  foundation: InstagramFoundationState;
  requiredScopes: string[];
  missingScopes: string[];
  connectedPage: {
    pageId: string | null;
    pageName: string | null;
  };
  lastTestResult: {
    success: boolean;
    testedAt: string | null;
    message: string;
    accountDetails: {
      id: string | null;
      username: string | null;
      profilePictureUrl: string | null;
      accountType: string | null;
      mediaCount: number | null;
    } | null;
  };
};

export type InstagramPublishResult = {
  platformPostId: string;
  platformPostUrl: string | null;
  firstComment: InstagramFirstCommentResult;
  responseSummary: Prisma.InputJsonValue;
};

export type InstagramFirstCommentResult = {
  attempted: boolean;
  status: "skipped" | "succeeded" | "failed";
  errorMessage: string | null;
  commentId: string | null;
  textLength: number;
  attemptCount?: number;
};

export function getInstagramFirstCommentSummary(
  responseSummary: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
): InstagramFirstCommentResult {
  if (!responseSummary || typeof responseSummary !== "object" || Array.isArray(responseSummary)) {
    return {
      attempted: false,
      status: "skipped",
      errorMessage: null,
      commentId: null,
      textLength: 0,
      attemptCount: 0,
    };
  }

  const rawFirstComment =
    "firstComment" in responseSummary &&
    responseSummary.firstComment &&
    typeof responseSummary.firstComment === "object" &&
    !Array.isArray(responseSummary.firstComment)
      ? (responseSummary.firstComment as Record<string, unknown>)
      : null;

  if (!rawFirstComment) {
    return {
      attempted: false,
      status: "skipped",
      errorMessage: null,
      commentId: null,
      textLength: 0,
    };
  }

  return {
    attempted: rawFirstComment.attempted === true,
    status:
      rawFirstComment.status === "succeeded" ||
      rawFirstComment.status === "failed" ||
      rawFirstComment.status === "skipped"
        ? rawFirstComment.status
        : "skipped",
    errorMessage: typeof rawFirstComment.errorMessage === "string" ? rawFirstComment.errorMessage : null,
    commentId: typeof rawFirstComment.commentId === "string" ? rawFirstComment.commentId : null,
    textLength: typeof rawFirstComment.textLength === "number" ? rawFirstComment.textLength : 0,
    attemptCount: typeof rawFirstComment.attemptCount === "number" ? rawFirstComment.attemptCount : undefined,
  };
}

type InstagramConnection = NonNullable<Awaited<ReturnType<typeof getFacebookConnection>>> & {
  instagramAccountId: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseInstagramMetadata(metadata: FacebookConnectionRecord["metadata"]): ParsedInstagramMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const rawInstagram =
    "instagram" in metadata &&
    metadata.instagram &&
    typeof metadata.instagram === "object" &&
    !Array.isArray(metadata.instagram)
      ? (metadata.instagram as Record<string, unknown>)
      : null;

  if (!rawInstagram) {
    return null;
  }

  return {
    status:
      rawInstagram.status === "READY" ||
      rawInstagram.status === "NOT_LINKED" ||
      rawInstagram.status === "LOOKUP_ERROR"
        ? rawInstagram.status
        : "NOT_LINKED",
    accountId: typeof rawInstagram.accountId === "string" ? rawInstagram.accountId : null,
    username: typeof rawInstagram.username === "string" ? rawInstagram.username : null,
    profilePictureUrl: typeof rawInstagram.profilePictureUrl === "string" ? rawInstagram.profilePictureUrl : null,
    source:
      rawInstagram.source === "instagram_business_account" || rawInstagram.source === "connected_instagram_account"
        ? rawInstagram.source
        : null,
    lastCheckedAt: typeof rawInstagram.lastCheckedAt === "string" ? rawInstagram.lastCheckedAt : null,
    errorMessage: typeof rawInstagram.errorMessage === "string" ? rawInstagram.errorMessage : null,
  };
}

export function getInstagramFoundationStateFromConnection(
  connection: FacebookConnectionRecord | null,
): InstagramFoundationState {
  if (!connection || connection.platform !== SocialPlatform.FACEBOOK || connection.status !== ConnectedAccountStatus.CONNECTED) {
    return {
      status: "FACEBOOK_DISCONNECTED",
      accountId: null,
      username: null,
      profilePictureUrl: null,
      source: null,
      pageId: connection?.pageId ?? null,
      pageName: connection?.pageName ?? null,
      facebookStatus: connection?.status ?? null,
      lastCheckedAt: null,
      errorMessage: null,
      isSelectableInComposer: false,
      message: "Connect a Facebook Page with a linked Instagram Business or Creator account to enable Instagram planning.",
    };
  }

  const instagram = parseInstagramMetadata(connection.metadata);
  if (!instagram) {
    return {
      status: "NOT_LINKED",
      accountId: null,
      username: null,
      profilePictureUrl: null,
      source: null,
      pageId: connection.pageId,
      pageName: connection.pageName,
      facebookStatus: connection.status,
      lastCheckedAt: null,
      errorMessage: null,
      isSelectableInComposer: false,
      message: "No linked Instagram Business or Creator account was detected on this Facebook Page yet.",
    };
  }

  if (instagram.status === "READY") {
    return {
      status: "READY",
      accountId: instagram.accountId,
      username: instagram.username,
      profilePictureUrl: instagram.profilePictureUrl,
      source: instagram.source,
      pageId: connection.pageId,
      pageName: connection.pageName,
      facebookStatus: connection.status,
      lastCheckedAt: instagram.lastCheckedAt,
      errorMessage: null,
      isSelectableInComposer: true,
      message: "Instagram is linked and ready for the first image publishing test.",
    };
  }

  if (instagram.status === "LOOKUP_ERROR") {
    return {
      status: "LOOKUP_ERROR",
      accountId: instagram.accountId,
      username: instagram.username,
      profilePictureUrl: instagram.profilePictureUrl,
      source: instagram.source,
      pageId: connection.pageId,
      pageName: connection.pageName,
      facebookStatus: connection.status,
      lastCheckedAt: instagram.lastCheckedAt,
      errorMessage: instagram.errorMessage,
      isSelectableInComposer: false,
      message: instagram.errorMessage || "Instagram account lookup failed for this Facebook Page.",
    };
  }

  return {
    status: "NOT_LINKED",
    accountId: null,
    username: null,
    profilePictureUrl: null,
    source: instagram.source,
    pageId: connection.pageId,
    pageName: connection.pageName,
    facebookStatus: connection.status,
    lastCheckedAt: instagram.lastCheckedAt,
    errorMessage: null,
    isSelectableInComposer: false,
    message: "This Facebook Page does not have a linked Instagram Business or Creator account yet.",
  };
}

export async function getInstagramFoundationState(input?: { refreshHealth?: boolean }) {
  const developerSettings = await getDeveloperSettings();
  if (developerSettings.instagram) {
    return {
      status: "READY",
      accountId: "dev-override-instagram",
      username: "dev_override_instagram",
      profilePictureUrl: null,
      source: null,
      pageId: null,
      pageName: "Developer Override",
      facebookStatus: null,
      lastCheckedAt: new Date().toISOString(),
      errorMessage: null,
      isSelectableInComposer: true,
      message: "Developer override enabled. Instagram is unlocked for composer testing without a live login.",
    } satisfies InstagramFoundationState;
  }

  if (input?.refreshHealth) {
    await refreshFacebookConnectionHealth({
      createNotification: false,
      source: "instagram_foundation_state",
    }).catch(() => null);
  }

  const connection = await getFacebookConnectionRecord();
  return getInstagramFoundationStateFromConnection(connection);
}

function getMissingInstagramScopes(scopes: string[]) {
  return INSTAGRAM_REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
}

function buildInstagramGraphUrl(pathname: string, params?: Record<string, string | number | undefined | null>) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(`https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}${normalizedPath}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function instagramGraphRequestJson<T>(input: URL, init: RequestInit) {
  const response = await fetch(input, init);
  const text = await response.text();
  let payload: T & {
    error?: {
      code?: number;
      error_subcode?: number;
      message?: string;
      type?: string;
      fbtrace_id?: string;
      error_user_title?: string;
      error_user_msg?: string;
    };
  };

  try {
    payload = text ? (JSON.parse(text) as typeof payload) : ({} as typeof payload);
  } catch {
    throw new Error(`Instagram returned an unreadable response (${response.status}).`);
  }

  if (!response.ok || payload.error) {
    const err = payload.error;
    const detail =
      err?.error_user_msg ||
      err?.message ||
      `Instagram Graph request failed (${response.status}).`;
    throw new Error(detail);
  }

  return payload;
}

async function getInstagramConnectionForPublishing() {
  const foundation = await getInstagramFoundationState({ refreshHealth: true });
  const connection = await getFacebookConnection();
  const missingScopes = connection ? getMissingInstagramScopes(connection.scopes) : [...INSTAGRAM_REQUIRED_SCOPES];

  if (!connection || !connection.pageId || !connection.pageName) {
    throw new Error("Connect a Facebook Page before using Instagram publishing.");
  }

  if (missingScopes.length > 0) {
    throw new Error(`Reconnect Meta and grant Instagram permissions: ${missingScopes.join(", ")}.`);
  }

  if (foundation.status !== "READY" || !foundation.accountId) {
    throw new Error(
      foundation.message ||
        "This Facebook Page does not have a linked Instagram Business or Creator account yet.",
    );
  }

  return {
    ...connection,
    instagramAccountId: foundation.accountId,
  } satisfies InstagramConnection;
}

export async function getInstagramDiagnostics(input?: { refreshHealth?: boolean }) {
  const foundation = await getInstagramFoundationState({ refreshHealth: input?.refreshHealth !== false });
  const connection = await getFacebookConnectionRecord();
  const missingScopes = getMissingInstagramScopes(connection?.scopes ?? []);

  if (!connection || foundation.status !== "READY" || !foundation.accountId) {
    return {
      foundation,
      requiredScopes: [...INSTAGRAM_REQUIRED_SCOPES],
      missingScopes,
      connectedPage: {
        pageId: connection?.pageId ?? null,
        pageName: connection?.pageName ?? null,
      },
      lastTestResult: {
        success: false,
        testedAt: foundation.lastCheckedAt,
        message: foundation.message,
        accountDetails: null,
      },
    } satisfies InstagramDiagnosticsResult;
  }

  try {
    const fullConnection = await getInstagramConnectionForPublishing();
    const response = await instagramGraphRequestJson<{
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      account_type?: string;
      media_count?: number;
    }>(
      buildInstagramGraphUrl(`/${foundation.accountId}`, {
        access_token: fullConnection.accessToken,
        fields: "id,username,name,profile_picture_url,account_type,media_count",
      }),
      { method: "GET" },
    );

    return {
      foundation,
      requiredScopes: [...INSTAGRAM_REQUIRED_SCOPES],
      missingScopes,
      connectedPage: {
        pageId: connection.pageId,
        pageName: connection.pageName,
      },
      lastTestResult: {
        success: true,
        testedAt: new Date().toISOString(),
        message: "Instagram account diagnostics succeeded.",
        accountDetails: {
          id: response.id ?? foundation.accountId,
          username: response.username ?? foundation.username,
          profilePictureUrl: response.profile_picture_url ?? foundation.profilePictureUrl,
          accountType: response.account_type ?? null,
          mediaCount: typeof response.media_count === "number" ? response.media_count : null,
        },
      },
    } satisfies InstagramDiagnosticsResult;
  } catch (error) {
    return {
      foundation,
      requiredScopes: [...INSTAGRAM_REQUIRED_SCOPES],
      missingScopes,
      connectedPage: {
        pageId: connection.pageId,
        pageName: connection.pageName,
      },
      lastTestResult: {
        success: false,
        testedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Instagram account diagnostics failed.",
        accountDetails: null,
      },
    } satisfies InstagramDiagnosticsResult;
  }
}

export async function validateInstagramPlanningPrerequisites(input: {
  mediaAssets: Array<{
    id: string;
    mimeType: string;
    storagePath: string;
  }>;
}) {
  const foundation = await getInstagramFoundationState({ refreshHealth: true });
  if (foundation.status !== "READY") {
    throw new Error("Instagram is not ready yet. Link an Instagram Business or Creator account to the connected Facebook Page first.");
  }

  if (input.mediaAssets.length === 0) {
    throw new Error("Instagram posts require at least 1 image.");
  }

  for (const mediaAsset of input.mediaAssets) {
    await validateStoredOriginalMediaAsset({
      mediaAsset,
    });
  }

  return foundation;
}

export async function validateInstagramPublishPrerequisites(input: {
  caption: string;
  firstComment?: string;
  mediaAssets: Array<{
    id: string;
    mimeType: string;
    storagePath: string;
  }>;
}) {
  const connection = await getInstagramConnectionForPublishing();

  if (input.mediaAssets.length === 0) {
    throw new Error("Instagram posts require at least 1 image.");
  }

  const trimmedCaption = input.caption.trim();
  const trimmedFirstComment = (input.firstComment || "").trim();
  const validatedMediaAssets: typeof input.mediaAssets = [];

  for (const mediaAsset of input.mediaAssets) {
    await validateStoredOriginalMediaAsset({
      mediaAsset,
    });
    validatedMediaAssets.push(mediaAsset);
  }

  return {
    connection,
    caption: trimmedCaption,
    firstComment: trimmedFirstComment,
    mediaAssets: validatedMediaAssets,
  };
}

async function createInstagramComment(input: {
  instagramMediaId: string;
  accessToken: string;
  message: string;
}) {
  const body = new URLSearchParams();
  body.set("access_token", input.accessToken);
  body.set("message", input.message);

  const response = await instagramGraphRequestJson<{
    id: string;
  }>(buildInstagramGraphUrl(`/${input.instagramMediaId}/comments`), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return response.id;
}

async function createInstagramCommentWithRetry(input: {
  instagramMediaId: string;
  accessToken: string;
  message: string;
}) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= INSTAGRAM_FIRST_COMMENT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const commentId = await createInstagramComment(input);
      return {
        commentId,
        attemptCount: attempt,
      };
    } catch (error) {
      lastError = handleFacebookApiError(error);

      if (attempt >= INSTAGRAM_FIRST_COMMENT_MAX_ATTEMPTS) {
        break;
      }

      await sleep(INSTAGRAM_FIRST_COMMENT_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError ?? new Error("Instagram first comment failed.");
}

async function createInstagramImageContainer(input: {
  instagramAccountId: string;
  accessToken: string;
  imageUrl: string;
  caption?: string;
  isCarouselItem?: boolean;
}) {
  const body = new URLSearchParams();
  body.set("access_token", input.accessToken);
  body.set("image_url", input.imageUrl);
  if (input.caption) {
    body.set("caption", input.caption);
  }
  if (input.isCarouselItem) {
    body.set("is_carousel_item", "true");
  }

  const response = await instagramGraphRequestJson<{
    id: string;
  }>(buildInstagramGraphUrl(`/${input.instagramAccountId}/media`), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return response.id;
}

async function createInstagramCarouselContainer(input: {
  instagramAccountId: string;
  accessToken: string;
  childContainerIds: string[];
  caption: string;
}) {
  const body = new URLSearchParams();
  body.set("access_token", input.accessToken);
  body.set("media_type", "CAROUSEL");
  body.set("children", input.childContainerIds.join(","));
  if (input.caption) {
    body.set("caption", input.caption);
  }

  const response = await instagramGraphRequestJson<{
    id: string;
  }>(buildInstagramGraphUrl(`/${input.instagramAccountId}/media`), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return response.id;
}

async function waitForInstagramContainerReady(input: {
  creationId: string;
  accessToken: string;
}) {
  for (let index = 0; index < INSTAGRAM_CONTAINER_MAX_POLLS; index += 1) {
    const response = await instagramGraphRequestJson<{
      status_code?: string;
      status?: string;
    }>(
      buildInstagramGraphUrl(`/${input.creationId}`, {
        access_token: input.accessToken,
        fields: "status_code,status",
      }),
      { method: "GET" },
    );

    const statusCode = (response.status_code || response.status || "").toUpperCase();
    if (!statusCode || statusCode === "FINISHED" || statusCode === "PUBLISHED") {
      return;
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`Instagram media processing failed with status ${statusCode}.`);
    }

    await sleep(INSTAGRAM_CONTAINER_POLL_INTERVAL_MS);
  }

  throw new Error("Instagram media processing did not finish in time.");
}

async function publishInstagramContainer(input: {
  instagramAccountId: string;
  accessToken: string;
  creationId: string;
}) {
  const body = new URLSearchParams();
  body.set("access_token", input.accessToken);
  body.set("creation_id", input.creationId);

  const response = await instagramGraphRequestJson<{
    id: string;
  }>(buildInstagramGraphUrl(`/${input.instagramAccountId}/media_publish`), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return response.id;
}

async function fetchInstagramPermalink(input: {
  instagramMediaId: string;
  accessToken: string;
}) {
  try {
    const response = await instagramGraphRequestJson<{
      permalink?: string;
    }>(
      buildInstagramGraphUrl(`/${input.instagramMediaId}`, {
        access_token: input.accessToken,
        fields: "permalink",
      }),
      { method: "GET" },
    );

    return response.permalink ?? null;
  } catch {
    return null;
  }
}

function appendInstagramTempDiagnostics(input: {
  responseSummary: Prisma.InputJsonValue | null | undefined;
  temporaryImages: TemporaryPlatformImage[];
  cleanupResults: TemporaryMediaCleanupResult[];
}) {
  const base =
    input.responseSummary && typeof input.responseSummary === "object" && !Array.isArray(input.responseSummary)
      ? { ...(input.responseSummary as Prisma.InputJsonObject) }
      : {};

  return {
    ...base,
    temporaryPlatformImages: input.temporaryImages.map((image) => ({
      storagePath: image.storagePath,
      width: image.width,
      height: image.height,
      sizeBytes: image.sizeBytes.toString(),
      mimeType: image.mimeType,
      platform: image.platform,
    })),
    temporaryPlatformImageCleanup: input.cleanupResults.map((result) => ({
      absolutePath: result.absolutePath,
      status: result.status,
      message: result.message,
    })),
  } satisfies Prisma.InputJsonObject;
}

export async function publishInstagramPost(input: {
  caption: string;
  firstComment?: string;
  mediaAssets: Array<{
    id: string;
    mimeType: string;
    storagePath: string;
  }>;
}) {
  const validation = await validateInstagramPublishPrerequisites(input);
  const temporaryImages: TemporaryPlatformImage[] = [];
  const cleanupResults: TemporaryMediaCleanupResult[] = [];

  try {
    const buildFirstCommentResult = async (publishedMediaId: string): Promise<InstagramFirstCommentResult> => {
      if (!validation.firstComment) {
        return {
          attempted: false,
          status: "skipped",
          errorMessage: null,
          commentId: null,
          textLength: 0,
        };
      }

      try {
        const commentResult = await createInstagramCommentWithRetry({
          instagramMediaId: publishedMediaId,
          accessToken: validation.connection.accessToken,
          message: validation.firstComment,
        });

        return {
          attempted: true,
          status: "succeeded",
          errorMessage: null,
          commentId: commentResult.commentId,
          textLength: validation.firstComment.length,
          attemptCount: commentResult.attemptCount,
        };
      } catch (error) {
        const normalizedError = handleFacebookApiError(error);
        return {
          attempted: true,
          status: "failed",
          errorMessage: normalizedError.message,
          commentId: null,
          textLength: validation.firstComment.length,
          attemptCount: INSTAGRAM_FIRST_COMMENT_MAX_ATTEMPTS,
        };
      }
    };

    const publicImageUrls: string[] = [];

    for (const mediaAsset of validation.mediaAssets) {
      const temporaryImage = await generateTemporaryPlatformImage({
        mediaAsset,
        platform: "INSTAGRAM",
      });
      temporaryImages.push(temporaryImage);

      const publicImageUrl = await createSignedPublicPlatformMediaUrl({
        platform: "INSTAGRAM",
        storagePath: temporaryImage.storagePath,
      });
      publicImageUrls.push(publicImageUrl);
    }

    const childContainerIds: string[] = [];

    if (publicImageUrls.length === 1) {
      const creationId = await createInstagramImageContainer({
        instagramAccountId: validation.connection.instagramAccountId,
        accessToken: validation.connection.accessToken,
        imageUrl: publicImageUrls[0],
        caption: validation.caption || undefined,
      });
      await waitForInstagramContainerReady({
        creationId,
        accessToken: validation.connection.accessToken,
      });
      const publishedMediaId = await publishInstagramContainer({
        instagramAccountId: validation.connection.instagramAccountId,
        accessToken: validation.connection.accessToken,
        creationId,
      });
      const platformPostUrl = await fetchInstagramPermalink({
        instagramMediaId: publishedMediaId,
        accessToken: validation.connection.accessToken,
      });
      const firstComment = await buildFirstCommentResult(publishedMediaId);

      return {
        platformPostId: publishedMediaId,
        platformPostUrl,
        firstComment,
        responseSummary: appendInstagramTempDiagnostics({
          responseSummary: {
            endpoint: "instagram_media_publish",
            creationId,
            publishedMediaId,
            pageId: validation.connection.pageId,
            pageName: validation.connection.pageName,
            instagramAccountId: validation.connection.instagramAccountId,
            platformPostUrl,
            mediaCount: publicImageUrls.length,
            firstComment,
          } satisfies Prisma.InputJsonObject,
          temporaryImages,
          cleanupResults,
        }),
      } satisfies InstagramPublishResult;
    }

    for (const imageUrl of publicImageUrls) {
      const childContainerId = await createInstagramImageContainer({
        instagramAccountId: validation.connection.instagramAccountId,
        accessToken: validation.connection.accessToken,
        imageUrl,
        isCarouselItem: true,
      });
      await waitForInstagramContainerReady({
        creationId: childContainerId,
        accessToken: validation.connection.accessToken,
      });
      childContainerIds.push(childContainerId);
    }

    const carouselCreationId = await createInstagramCarouselContainer({
      instagramAccountId: validation.connection.instagramAccountId,
      accessToken: validation.connection.accessToken,
      childContainerIds,
      caption: validation.caption,
    });
    await waitForInstagramContainerReady({
      creationId: carouselCreationId,
      accessToken: validation.connection.accessToken,
    });
    const publishedMediaId = await publishInstagramContainer({
      instagramAccountId: validation.connection.instagramAccountId,
      accessToken: validation.connection.accessToken,
      creationId: carouselCreationId,
    });
    const platformPostUrl = await fetchInstagramPermalink({
      instagramMediaId: publishedMediaId,
      accessToken: validation.connection.accessToken,
    });
    const firstComment = await buildFirstCommentResult(publishedMediaId);

    return {
      platformPostId: publishedMediaId,
      platformPostUrl,
      firstComment,
      responseSummary: appendInstagramTempDiagnostics({
        responseSummary: {
          endpoint: "instagram_carousel_publish",
          childContainerIds,
          creationId: carouselCreationId,
          publishedMediaId,
          pageId: validation.connection.pageId,
          pageName: validation.connection.pageName,
          instagramAccountId: validation.connection.instagramAccountId,
          platformPostUrl,
          mediaCount: publicImageUrls.length,
          firstComment,
        } satisfies Prisma.InputJsonObject,
        temporaryImages,
        cleanupResults,
      }),
    } satisfies InstagramPublishResult;
  } catch (error) {
    const normalizedError = handleFacebookApiError(error);
    throw new Error(normalizedError.message);
  } finally {
    for (const temporaryImage of temporaryImages) {
      const cleanup = await cleanupTemporaryPlatformImage(temporaryImage.absolutePath);
      cleanupResults.push(cleanup);
    }
  }
}

export async function claimInstagramPostForPublishing(input: {
  socialPostId: string;
  allowedStatuses: SocialPostStatus[];
}) {
  return prisma.$transaction(async (tx) => {
    const platformRecord = await tx.socialPostPlatform.findUnique({
      where: {
        socialPostId_platform: {
          socialPostId: input.socialPostId,
          platform: SocialPlatform.INSTAGRAM,
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
        message: "This Instagram post is not in a publishable state.",
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
        message: "This Instagram post was already published and cannot be published again.",
      };
    }

    const runningAttempt = await tx.publishAttempt.findFirst({
      where: {
        socialPostId: input.socialPostId,
        platform: SocialPlatform.INSTAGRAM,
        status: PublishAttemptStatus.PENDING,
        finishedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (runningAttempt) {
      return {
        ok: false as const,
        reason: "ALREADY_RUNNING" as const,
        message: "An Instagram publish attempt is already running for this post.",
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
        message: "Another publish action already claimed this Instagram post.",
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

export async function executeInstagramPublish(input: {
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
    throw new Error("Instagram platform record not found.");
  }

  if (platformRecord.platform !== SocialPlatform.INSTAGRAM) {
    throw new Error("Only Instagram platform records can use the Instagram publisher.");
  }

  if (
    platformRecord.platformPostId ||
    platformRecord.publishedAt ||
    platformRecord.status === SocialPostStatus.PUBLISHED
  ) {
    throw new Error("This Instagram post was already published and will not be published again.");
  }

  const mediaAssets = platformRecord.socialPost.attachedMedia.map((item) => item.mediaAsset);
  const [businessVariables, hashtagSettings] = await Promise.all([
    getBusinessVariableSettings(),
    getHashtagSettings(),
  ]);
  const renderedContent = resolveRenderedPlatformContent(
    platformRecord.socialPost,
    SocialPlatform.INSTAGRAM,
    businessVariables,
    hashtagSettings,
  );
  const attempt = await prisma.publishAttempt.create({
    data: {
      socialPostId: platformRecord.socialPostId,
        socialPostPlatformId: platformRecord.id,
        platform: SocialPlatform.INSTAGRAM,
        status: PublishAttemptStatus.PENDING,
        requestSummary: {
          captionLength: renderedContent.descriptionText.length,
          mediaCount: mediaAssets.length,
          mediaAssetIds: mediaAssets.map((asset) => asset.id),
          platform: SocialPlatform.INSTAGRAM,
          usedOverride: renderedContent.usedOverride,
          effectiveDescriptionLength: renderedContent.descriptionText.length,
          firstCommentAttempted: Boolean(renderedContent.firstCommentText),
          firstCommentLength: renderedContent.firstCommentText.length,
          variablesRendered: renderedContent.variablesRendered,
          unresolvedVariablesCount: renderedContent.unresolvedVariableNames.length,
          unresolvedVariableNames: renderedContent.unresolvedVariableNames,
          hashtagCount: renderedContent.hashtagsUsed.length,
          hashtagPlacement: renderedContent.hashtagPlacement,
        },
        startedAt: new Date(),
      },
    });

    try {
      if (renderedContent.unresolvedVariableNames.length > 0) {
        throw new Error(
          `These variables are missing values: ${renderedContent.unresolvedVariableNames
            .map((name) => `{{${name}}}`)
            .join(", ")}`,
        );
      }
      const result = await publishInstagramPost({
        caption: renderedContent.descriptionText,
        firstComment: renderedContent.firstCommentText,
        mediaAssets,
      });
    const finishedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.publishAttempt.update({
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
      });
      await tx.socialPostPlatform.update({
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
      });
      await syncSocialPostAggregateState(tx, platformRecord.socialPostId);
    });

    if (result.firstComment.attempted && result.firstComment.status === "succeeded") {
      await createAuditLog({
        actorAdminUserId: platformRecord.socialPost.updatedByAdminUserId,
        action: AUDIT_ACTIONS.INSTAGRAM_FIRST_COMMENT_PUBLISHED,
        targetType: "SocialPost",
        targetId: platformRecord.socialPostId,
        metadata: {
          platform: SocialPlatform.INSTAGRAM,
          commentId: result.firstComment.commentId,
          textLength: result.firstComment.textLength,
        },
      }).catch(() => undefined);
    }

    if (result.firstComment.attempted && result.firstComment.status === "failed") {
      await createAuditLog({
        actorAdminUserId: platformRecord.socialPost.updatedByAdminUserId,
        action: AUDIT_ACTIONS.INSTAGRAM_FIRST_COMMENT_FAILED,
        targetType: "SocialPost",
        targetId: platformRecord.socialPostId,
        metadata: {
          platform: SocialPlatform.INSTAGRAM,
          textLength: result.firstComment.textLength,
          errorMessage: result.firstComment.errorMessage,
        },
      }).catch(() => undefined);
    }

    return {
      attemptId: attempt.id,
      result,
      finishedAt,
      status: SocialPostStatus.PUBLISHED,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "Instagram publishing failed.";

    await prisma.$transaction(async (tx) => {
      await tx.publishAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: PublishAttemptStatus.FAILED,
          errorCode: "INSTAGRAM_PUBLISH_FAILED",
          errorMessage: message,
          finishedAt,
        },
      });
      await tx.socialPostPlatform.update({
        where: {
          id: platformRecord.id,
        },
        data: {
          status: SocialPostStatus.FAILED,
          lastError: message,
        },
      });
      await syncSocialPostAggregateState(tx, platformRecord.socialPostId, {
        failureReason: message,
      });
    });

    await createOrUpdatePlatformPublishFailedNotification({
      provider: SocialPlatform.INSTAGRAM,
      postId: platformRecord.socialPostId,
      message: "Instagram posting failed.",
      detail: message,
    }).catch(() => undefined);

    throw new Error(message);
  }
}
