import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: process.env.NODE_ENV || "test",
    DATABASE_URL: process.env.DATABASE_URL || "mysql://test:test@127.0.0.1:3306/test",
    APP_URL: "https://smm.nctilepros.com",
    META_INSTAGRAM_PUBLISHING_ENABLED: "true",
    META_INSTAGRAM_COMMENTS_ENABLED: "false",
  });

  const {
    buildFacebookOauthAuthorizeUrl,
    buildFacebookRedirectUri,
    compareFacebookOauthState,
    FACEBOOK_REQUIRED_SCOPES,
  } = await import("../src/lib/facebook");
  const { getInstagramFoundationStateFromConnection } = await import("../src/lib/instagram");
  const {
    isMetaInstagramCommentsEnabled,
    isMetaInstagramPublishingEnabled,
  } = await import("../src/lib/meta-instagram-capability");
  const { applyHashtagsToPlatformContent } = await import("../src/lib/hashtags");
  const { SocialPlatform, ConnectedAccountStatus } = await import("@prisma/client");
  const { postFormSchema } = await import("../src/lib/validation");

  const redirectUri = buildFacebookRedirectUri("https://smm.nctilepros.com");
  assert.equal(redirectUri, "https://smm.nctilepros.com/api/facebook/callback");

  const oauthUrl = new URL(
    buildFacebookOauthAuthorizeUrl({
      appId: "1322657299242526",
      redirectUri,
      state: "redacted-state",
      scopes: FACEBOOK_REQUIRED_SCOPES,
    }),
  );

  assert.equal(oauthUrl.origin, "https://www.facebook.com");
  assert.equal(oauthUrl.pathname, "/v23.0/dialog/oauth");
  assert.equal(oauthUrl.searchParams.get("client_id"), "1322657299242526");
  assert.equal(oauthUrl.searchParams.get("redirect_uri"), "https://smm.nctilepros.com/api/facebook/callback");
  assert.equal(oauthUrl.searchParams.get("response_type"), "code");

  const requestedScopes: string[] = (oauthUrl.searchParams.get("scope") || "").split(",").filter(Boolean);
  assert.deepEqual(requestedScopes, [...FACEBOOK_REQUIRED_SCOPES]);
  const requestedScopeSet = new Set<string>(requestedScopes);
  assert.ok(requestedScopeSet.has("pages_show_list"));
  assert.ok(requestedScopeSet.has("pages_read_engagement"));
  assert.ok(requestedScopeSet.has("pages_manage_posts"));
  assert.ok(requestedScopeSet.has("instagram_basic"));
  assert.ok(requestedScopeSet.has("instagram_content_publish"));
  assert.ok(!requestedScopeSet.has("instagram_manage_comments"));

  assert.equal(compareFacebookOauthState("same-state", "same-state"), true);
  assert.equal(compareFacebookOauthState("same-state", "different-state"), false);
  assert.equal(compareFacebookOauthState("same-state", null), false);

  assert.equal(isMetaInstagramPublishingEnabled(), true);
  assert.equal(isMetaInstagramCommentsEnabled(), false);

  const instagramFoundation = getInstagramFoundationStateFromConnection({
    platform: SocialPlatform.FACEBOOK,
    status: ConnectedAccountStatus.CONNECTED,
    pageId: "page_test",
    pageName: "NC Tile Pros",
    metadata: {
      instagram: {
        status: "READY",
        accountId: "instagram_test",
        username: "nctilepros",
        profilePictureUrl: null,
        source: "instagram_business_account",
        lastCheckedAt: new Date().toISOString(),
        errorMessage: null,
      },
    },
  } as never);
  assert.equal(instagramFoundation.status, "READY");
  assert.equal(instagramFoundation.isSelectableInComposer, true);

  const instagramCaption = applyHashtagsToPlatformContent({
    platform: SocialPlatform.INSTAGRAM,
    descriptionText: "Fresh tile installation.",
    firstCommentText: "",
    hashtags: ["tileinstallation", "raleighnc"],
    includeHashtagsInGoogle: false,
    facebookDefaultLimit: 5,
  });
  assert.equal(instagramCaption.placement, "description");
  assert.match(instagramCaption.descriptionText, /#tileinstallation #raleighnc/);
  assert.equal(instagramCaption.firstCommentText, "");

  const rejectedFirstComment = postFormSchema.safeParse({
    postId: "",
    mediaAssetIds: ["media_test"],
    descriptionMain: "Instagram caption",
    descriptionFacebook: "",
    descriptionInstagram: "",
    instagramFirstComment: "#not-allowed",
    descriptionGoogleBusiness: "",
    hashtags: [],
    includeHashtagsInGoogle: "",
    appliedHashtagGroups: [],
    scheduledDate: "",
    scheduledHour: "",
    scheduledMinute: "00",
    scheduledMeridiem: "PM",
    platforms: ["INSTAGRAM"],
    intent: "draft",
  });
  assert.equal(rejectedFirstComment.success, false);

  const composerSource = await readFile("src/components/post-editor-form.tsx", "utf8");
  const instagramPublisherSource = await readFile("src/lib/instagram.ts", "utf8");
  assert.ok(!composerSource.includes("Instagram First Comment"));
  assert.ok(!composerSource.includes('placeholder="Optional first comment for Instagram'));
  assert.ok(!instagramPublisherSource.includes("instagram_manage_comments"));
  assert.ok(!instagramPublisherSource.includes("/comments"));

  console.log("Meta Facebook and Instagram publishing scope checks passed; Instagram comments remain disabled.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
