import assert from "node:assert/strict";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: process.env.NODE_ENV || "test",
    DATABASE_URL: process.env.DATABASE_URL || "mysql://test:test@127.0.0.1:3306/test",
    APP_URL: "https://smm.nctilepros.com",
    META_INSTAGRAM_ENABLED: "false",
  });

  const {
    buildFacebookOauthAuthorizeUrl,
    buildFacebookRedirectUri,
    compareFacebookOauthState,
    FACEBOOK_REQUIRED_SCOPES,
  } = await import("../src/lib/facebook");
  const {
    claimInstagramPostForPublishing,
    getInstagramFoundationStateFromConnection,
    validateInstagramPublishPrerequisites,
  } = await import("../src/lib/instagram");
  const {
    META_INSTAGRAM_NOT_ENABLED_MESSAGE,
    META_INSTAGRAM_UNAVAILABLE_MESSAGE,
  } = await import("../src/lib/meta-instagram-capability");

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
  assert.ok(!requestedScopeSet.has("instagram_basic"));
  assert.ok(!requestedScopeSet.has("instagram_content_publish"));
  assert.ok(!requestedScopeSet.has("instagram_manage_comments"));

  assert.equal(compareFacebookOauthState("same-state", "same-state"), true);
  assert.equal(compareFacebookOauthState("same-state", "different-state"), false);
  assert.equal(compareFacebookOauthState("same-state", null), false);

  const instagramFoundation = getInstagramFoundationStateFromConnection(null);
  assert.equal(instagramFoundation.status, "DISABLED");
  assert.equal(instagramFoundation.message, META_INSTAGRAM_UNAVAILABLE_MESSAGE);
  assert.equal(instagramFoundation.isSelectableInComposer, false);

  await assert.rejects(
    () =>
      validateInstagramPublishPrerequisites({
        caption: "Test caption",
        mediaAssets: [],
      }),
    (error) => {
      assert.equal(error instanceof Error ? error.message : "", META_INSTAGRAM_NOT_ENABLED_MESSAGE);
      return true;
    },
  );

  const claim = await claimInstagramPostForPublishing({
    socialPostId: "post_test",
    allowedStatuses: [],
  });
  assert.deepEqual(claim, {
    ok: false,
    reason: "UNSUPPORTED_PLATFORM",
    message: META_INSTAGRAM_NOT_ENABLED_MESSAGE,
  });

  console.log("Meta Facebook-only scope and Instagram-disabled checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
