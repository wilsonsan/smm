# Social Media Manager Foundation

Self-hosted social media scheduler foundation built with Next.js App Router, TypeScript, Prisma, and MySQL.

This foundation now includes the secure admin shell, media processing pipeline, draft/schedule workflow, Facebook OAuth connection management, manual Facebook publishing, and the first real scheduled Facebook worker path.

## Included

- Protected admin dashboard with session-cookie auth
- Admin-only login/logout
- Prisma schema and initial MySQL migration
- Environment-seeded admin account
- Draft/save/edit/delete/schedule/cancel workflow for Facebook-ready posts
- Authenticated local media upload with original preservation and temporary publish-time optimization
- Sharp-based Facebook JPEG generation at publish time with cleanup tooling
- Admin-only media library with preview thumbnails
- Calendar-first post management with draft, scheduled, failed, published, and optional cancelled visibility
- Monthly calendar view with clickable status-toned cards and thumbnails
- Settings page for non-secret runtime config
- Facebook OAuth connection flow with encrypted Page token storage
- Manual Facebook `Post Now` publishing for text-only and image posts
- Connected Page test/disconnect controls
- Audit logs for the key admin actions in this phase
- Facebook publish worker for due scheduled posts

## Tech Notes

- Framework: Next.js App Router
- Language: TypeScript
- ORM: Prisma
- Database: MySQL via `DATABASE_URL`
- Auth: server-side session records plus secure `HttpOnly` cookies
- Storage: local filesystem uploads directory
- Secrets: environment variables only

## Initial Data Model

Core Prisma models:

- `AdminUser`
- `AdminSession`
- `AppSetting`
- `MediaAsset`
- `MediaVariant`
- `SocialPost`
- `SocialPostPlatform`
- `PublishAttempt`
- `AuditLog`
- `ConnectedAccount`

Platform enum:

- `FACEBOOK`
- `INSTAGRAM`
- `GOOGLE_BUSINESS`

Post status enum:

- `DRAFT`
- `SCHEDULED`
- `PUBLISHING`
- `PUBLISHED`
- `FAILED`
- `CANCELLED`

## Local Setup

1. Copy [.env.example](/C:/Users/Corsair/Desktop/smm-dev/.env.example) to `.env`.
2. Set `DATABASE_URL`, `APP_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
3. Start MySQL and create the target database named in `DATABASE_URL`.
4. Install dependencies:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install
```

5. Apply the initial migration:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run prisma:migrate
```

6. Seed the admin account and default settings:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run db:seed
```

This command loads values from the local `.env` file, including `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

7. Start the app:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

8. For local testing on port `3196`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev -- --port 3196
```

9. Visit [http://127.0.0.1:3196](http://127.0.0.1:3196) and sign in with the seeded admin credentials.

## Environment Variables

Required or recommended values:

- `DATABASE_URL`: MySQL connection string
- `APP_URL`: absolute public app origin used for same-origin checks and the Facebook OAuth redirect
- `UPLOAD_DIR`: local upload directory, default `./uploads`
- `MAX_UPLOAD_BYTES`: max accepted upload size in bytes
- `SESSION_TTL_HOURS`: admin session lifetime
- `ADMIN_EMAIL`: seed admin email
- `ADMIN_PASSWORD`: seed admin password
- `FACEBOOK_APP_ID`: optional env fallback if you do not store it in Settings
- `FACEBOOK_APP_SECRET`: required env secret for the Meta app
- `TOKEN_ENCRYPTION_KEY`: required env secret used to encrypt stored Facebook Page access tokens

Recommended production checklist:

- keep `FACEBOOK_APP_SECRET` and `TOKEN_ENCRYPTION_KEY` only in environment variables
- use a long random `TOKEN_ENCRYPTION_KEY`
- point `UPLOAD_DIR` to a persistent volume or mounted host path
- set `APP_URL` to the real public origin that Meta will call back to

## Security Notes

- No public registration flow exists.
- All dashboard pages require authentication.
- All write actions require authentication.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Passwords are hashed with `bcryptjs`.
- Uploads are validated server-side for size, type, and image dimensions.
- The upload path is generated server-side; client file metadata is not trusted.
- Uploads are stored outside the public web root by default.
- Media files are served through an authenticated route, not by arbitrary path.
- Post state transitions are validated server-side before writes are accepted.
- Audit records are written for login, logout, create/update/schedule/cancel/delete/return-to-draft post actions, settings save, media upload, and media changes.
- Facebook access tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY`.
- Facebook OAuth uses a server-side state cookie and never exposes tokens to the client.
- Facebook app secret stays in environment variables only.
- The scheduled worker is a server-side command, not a public endpoint.
- Publish attempts and audit logs never store raw Facebook access tokens.

## Media Processing

- Upload endpoint: `POST /api/admin/uploads`
- Media route: `GET /api/admin/media/:variantId`
- Current scope: single-image upload for the composer flow and media library
- Stored metadata: original filename, MIME type, size, width, height, storage path
- Preserved source: the original upload is stored untouched and also recorded as the `ORIGINAL` variant
- Permanent storage now keeps only the original upload
- Temporary Facebook publish images are generated on demand with:
  - max `2048x2048`
  - JPEG quality `88`
  - auto-rotation from orientation metadata
  - metadata stripping
  - forced `sRGB`
  - non-progressive JPEG output
  - no enlargement
- Temporary Google and Instagram generation paths are reserved for future channels
- Storage layout:
  - `uploads/originals/yyyy/mm/...`
  - `uploads/tmp/facebook/yyyy/mm/dd/...`

Cleanup commands:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run media:cleanup-variants
& 'C:\Program Files\nodejs\npm.cmd' run media:cleanup-temp
```

- `media:cleanup-variants` deletes old non-original stored variant files and removes their database records
- `media:cleanup-temp` removes temporary generated publish images older than 24 hours

## Sharp Notes

- Sharp is already included in the project dependencies.
- JPEG, PNG, and WebP uploads are supported when the file signature matches.
- HEIC/HEIF uploads are attempted when the Sharp/libvips build supports them.
- If HEIC/HEIF decoding is unavailable in the current environment, uploads fail with a clear server-side error instead of partially saving the file.

## Composer And Scheduling

- Composer page: `/dashboard/posts/new`
- Edit/detail page: `/dashboard/posts/:id`
- Posts index: `/dashboard/posts` redirects to the calendar
- Calendar: `/dashboard/calendar`

Supported statuses:

- `DRAFT`
- `SCHEDULED`
- `PUBLISHING`
- `PUBLISHED`
- `FAILED`
- `CANCELLED`

Current server-side rules:

- `DRAFT`: can be edited, scheduled, and deleted
- `SCHEDULED`: can be edited, cancelled, and returned to draft
- `PUBLISHING`: read-only
- `PUBLISHED`: read-only
- `FAILED`: can be edited, saved back to draft, or rescheduled
- `CANCELLED`: can be returned to draft or rescheduled

Timezone behavior:

- App scheduling uses the timezone saved in Settings
- Default timezone is `America/New_York`
- `scheduledAt` is stored in UTC in MySQL
- Drafts use `scheduledAt` as their calendar intent when a date/time is selected
- Published items fall back to `publishedAt` and then `createdAt` for calendar placement
- UI date/time displays are rendered in the configured app timezone

Facebook media behavior:

- The composer selects the original media asset when an image is attached
- New posts start with no media preselected
- `Clear Media` removes the attached asset from the form immediately so saving persists a text-only post when desired
- Facebook creates a temporary optimized JPEG automatically at publish time

## Facebook OAuth And Publishing

- Connect route: `GET /api/facebook/connect`
- Callback route: `GET /api/facebook/callback`
- Facebook settings page: `/dashboard/settings/channels/facebook`
- Required scopes in code:
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_posts`
- Optional diagnostic scope:
  - `business_management`
- Connected Page storage:
  - uses `ConnectedAccount`
  - stores the selected Facebook Page token encrypted
  - stores Page id/name, account id/name, scopes, token expiry if Meta returns one, status, and token health timestamps
  - persists across deploys and restarts until the user disconnects the Page or the token becomes invalid

Facebook connection persistence and token health:

- the saved Facebook connection is reused automatically for:
  - `Post Now`
  - retry publish
  - scheduled worker publishing
- reconnect is only required when the token expires, becomes invalid, or required scopes drift
- server-side token health checks now run:
  - when `Settings > Facebook` loads
  - before manual Facebook publishing
  - before scheduled worker publishing
- connection status can now move through:
  - `CONNECTED`
  - `NEEDS_RECONNECT`
  - `EXPIRED`
  - `INVALID`
  - `MISSING_SCOPES`
  - `DISCONNECTED`
  - `ERROR`
- related Facebook token notifications are dismissed automatically after a successful reconnect or healthy token test

Dashboard notifications:

- the dashboard shell now has a shared notification bell with an unread red badge
- clicking a notification marks it read and opens its action URL
- current notification foundation supports:
  - `TOKEN_EXPIRED`
  - `TOKEN_INVALID`
  - `MISSING_SCOPE`
  - `PUBLISH_FAILED`
  - `WORKER_ERROR`
  - `INFO`
- provider support is future-ready for:
  - `FACEBOOK`
  - `INSTAGRAM`
  - `GOOGLE_BUSINESS`

Manual Facebook publishing behavior:

- `Post Now` is available for `DRAFT`, `SCHEDULED`, and `FAILED` posts
- `Post Now` is blocked for posts that are already published
- future-scheduled posts require an explicit confirmation before immediate publishing
- `Retry Publish` is shown for failed Facebook posts and creates a fresh publish attempt without overwriting prior history
- text-only publishing is supported
- image publishing validates the stored original before upload
- image publishing then generates a temporary optimized JPEG and validates:
  - the original file exists on disk
  - the original file is readable
  - the temporary JPEG exists on disk
  - the temporary JPEG is readable
  - MIME type is `image/jpeg`
  - file size stays within the current Facebook-safe limit
- temporary publish images are deleted after each publish attempt, whether it succeeds or fails
- successful publishes mark the post/platform `PUBLISHED`, store the returned post id, and keep the latest publish attempt details
- failed publishes mark the post/platform `FAILED` and keep the error on both the post and the publish attempt
- common Meta API failures are mapped to friendlier UI messages for:
  - expired tokens
  - missing scopes
  - invalid Page token or Page access
  - media upload issues
  - development-mode or app availability issues
  - rate limiting

Facebook connection diagnostics:

- the Facebook settings page shows:
  - connected Page name
  - Page id
  - connection status
  - granted scopes
  - missing required scopes
  - token expiry when Meta provides it
  - last tested time
- the same page includes runtime checks for:
  - `FACEBOOK_APP_ID`
  - `FACEBOOK_APP_SECRET`
  - `TOKEN_ENCRYPTION_KEY`
  - `APP_URL`
  - `DATABASE_URL`
- tokens are encrypted at rest and never returned to the browser
- logs and publish attempts never store raw access tokens
  - if the token becomes invalid or scopes drift, the Facebook settings page now shows reconnect guidance directly in the UI
  - token failures also create or update an in-app dashboard notification that links back to `Settings > Facebook`
- the Advanced Facebook Debug section can now show:
  - Graph API version used
  - OAuth redirect URI used
  - requested scopes
  - granted scopes
  - missing required scopes
  - short-lived vs long-lived user token diagnostics
  - token debug summaries from Meta's `debug_token` endpoint
  - sanitized `/me`, `/me/permissions`, `/me/accounts`, `/me/businesses`, `owned_pages`, `client_pages`, and `assigned_pages` responses
  - manual Page ID tests using the current diagnostic user token bundle
- diagnostics snapshots are stored sanitized; raw user tokens remain encrypted in a short-lived server-only cookie and are never rendered in the browser

Reference docs:

- [Pages API](https://developers.facebook.com/docs/pages-api/)
- [User accounts reference](https://developers.facebook.com/docs/graph-api/reference/user/accounts/)
- [Facebook Login access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/)
- [debug_token reference](https://developers.facebook.com/docs/graph-api/reference/debug_token/)

## Publish Worker

Run the placeholder worker manually with:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run worker:publish
```

Current behavior:

- finds due scheduled Facebook platform records
- claims them in a transaction by moving them to `PUBLISHING`
- skips rows that are already published, already have a `platformPostId`, or already have a running publish attempt
- checks for stale `PUBLISHING` records and marks them `FAILED` if they were stuck longer than the current timeout window
- calls the shared Facebook publisher service
- creates a `PublishAttempt` with request/response/error summaries
- marks the post/platform `PUBLISHED` or `FAILED`
- prevents duplicate posting by claiming scheduled rows before publishing begins
- logs each worker run with a summary of claimed, published, failed, skipped, and recovered posts
- records worker run metadata for the dashboard card:
  - last worker run
  - last worker result summary
  - last worker error
  - last successful Facebook publish
  - last failed Facebook publish
  - due, publishing, failed, and next scheduled post counts

This is structured so we can later run the same worker from a cron job or dedicated worker container.

Current operator visibility:

- dashboard worker card shows whether the worker is enabled in this phase, the latest run, due count, publishing count, stuck publishing count, failed count, next scheduled post, and the last worker error
- post detail pages show:
  - latest publish attempt status
  - started and finished timestamps
  - platform
  - retry count
  - error code and message
  - platform post id
  - Facebook post URL when available
  - request and response summaries
  - full publish attempt history in a collapsible table

Operational note:

- for production, run `npm run worker:publish` from cron, a scheduled Docker container, or an equivalent supervisor
- do not expose that command through a public route
- a practical first schedule is every minute

## Dashboard And Operations

The dashboard now highlights:

- next scheduled post
- posts scheduled this week
- failed posts needing attention
- last successful Facebook post
- worker health and stale publishing warnings
- connected Facebook Page summary

The calendar remains the main command center and now includes filters for:

- `DRAFT`
- `SCHEDULED`
- `PUBLISHING`
- `PUBLISHED`
- `FAILED`
- `CANCELLED`

## Docker Notes

- A starter [docker-compose.example.yml](/C:/Users/Corsair/Desktop/smm-dev/docker-compose.example.yml) is included for local self-hosted development.
- A working [docker-compose.yml](/C:/Users/Corsair/Desktop/smm-dev/docker-compose.yml) is included for local MySQL startup.
- For this workstation, local testing is expected on `http://127.0.0.1:3196`.
- For your homelab dev deployment, set `APP_URL=https://smm-dev.nctilepros.com`.
- For production later, set `APP_URL=https://smm.nctilepros.com`.
- A production-oriented [Dockerfile](/C:/Users/Corsair/Desktop/smm-dev/Dockerfile) is included.
- Mount the uploads directory as a persistent volume.
- Run migrations and seed as explicit startup/deploy steps; they are not auto-run in the container image.
- Keep Facebook credentials in container environment variables, not in the database.
- Keep `TOKEN_ENCRYPTION_KEY` in container environment variables too.
- Run the publish worker as a separate cron invocation or scheduled container task:

```bash
npm run worker:publish
```

Recommended deployment steps after `git pull`:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
npm run start -- --port 3196
```

## Backups And Recovery

Back up both:

- the MySQL database
- the entire uploads directory

Recommended minimum:

- daily MySQL dump or equivalent database snapshot
- daily filesystem backup of `UPLOAD_DIR`
- keep the database dump and uploads backup from the same window so post records and files stay aligned

If the app is restored onto a new server:

- restore MySQL first
- restore the uploads directory second
- set the same `TOKEN_ENCRYPTION_KEY` so encrypted Facebook Page tokens remain readable
- if the encryption key changed or was lost, reconnect Facebook from Settings after restore

## Troubleshooting Checklist

- If Facebook connect is blocked, confirm:
  - `APP_URL` is correct
  - the exact redirect URI from the Facebook settings page is registered in Meta
  - `FACEBOOK_APP_SECRET` and `TOKEN_ENCRYPTION_KEY` are present
- If Facebook OAuth succeeds but no Pages are found:
  - run `Run Facebook Diagnostics`
  - confirm the granted scopes
  - confirm `/me` returns the expected Facebook user
  - compare `/me/accounts` for both short-lived and long-lived token sources
  - confirm whether Page access tokens are present in the sanitized account rows
  - if `/me/accounts` is empty, inspect `/me/businesses`, `owned_pages`, `client_pages`, and `/me/assigned_pages`
  - if fallback-only business results appear, add `business_management` and reconnect
  - if Graph API Explorer or Postiz can see Pages but this app cannot, compare Graph API version, token source, and Meta app id
- If `Test Connection` fails, review:
  - granted scopes
  - missing scopes
  - app mode or test-user access
  - token expiry and last error on the Facebook settings page
- If image publishing fails, confirm:
  - the media asset still exists
  - the original file exists on disk and is readable
  - the app can generate a temporary Facebook JPEG from that original
- If a post stays in `PUBLISHING`, run the worker again and review the dashboard worker card plus the post detail history
- If chunks or CSS look stale locally after a rebuild, restart the app process and hard refresh the browser tab

## Verification

Verified in this workspace:

- `npm install`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run db:seed`
- `npm run lint`
- `npm run build`
- browser login verification on `http://127.0.0.1:3196`
- synthetic media-processing smoke test confirming:
  - original preserved
  - temporary Facebook publish images can be resized safely from the original
- browser verification of:
  - `/dashboard/calendar`
  - `/dashboard/settings`

## Manual Testing Checklist

1. Open [http://127.0.0.1:3196/login](http://127.0.0.1:3196/login) and sign in with the seeded admin account.
2. Go to `New Post`.
3. Confirm the composer loads with no media preselected and no preview attached.
4. Upload a raw job photo from the upload area or select an existing item from the recent media picker.
5. Confirm the success/selection state shows the original preview and notes that Facebook optimization happens at publish time.
6. Confirm the selected media summary shows original dimensions and file size.
7. Click `Clear Media` and confirm the preview disappears immediately, then save and verify the post stays text-only when reopened.
8. Save a draft with a date/time and confirm it appears on the correct day in `Calendar` with muted draft styling.
9. Reopen the draft from `Calendar`, edit it, and save it again.
10. Schedule a post with a future date/time and confirm it appears on the correct day in `Calendar` with the scheduled styling.
11. Open the scheduled post and test:
   - `Cancel Scheduled Post`
   - `Return To Draft`
12. Confirm failed items are visually obvious on `Calendar`, and published items show completed styling if you create those states later.
13. Use the calendar status filters to hide and show `Draft`, `Scheduled`, `Publishing`, `Published`, `Failed`, and `Cancelled` items.
14. Confirm `PUBLISHING` and `PUBLISHED` posts remain read-only if you create those states later.
15. Visit `Media` in the sidebar and confirm the asset appears in the library.
16. If testing HEIC/HEIF, confirm either:
   - the upload succeeds and the original is stored while previewing still works, or
   - the app returns the explicit unsupported-codec error without partial records.

## Facebook Manual Testing Checklist

1. Set these environment variables in `.env`:
   - `DATABASE_URL`
   - `APP_URL`
   - `FACEBOOK_APP_SECRET`
   - `TOKEN_ENCRYPTION_KEY`
   - optionally `FACEBOOK_APP_ID`
2. Create a Meta app with Facebook Login and Pages permissions enabled.
3. Add the exact redirect URI shown on `/dashboard/settings/channels/facebook` to the Meta app.
4. Confirm the app has these scopes configured for review/testing:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
5. Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run prisma:migrate
& 'C:\Program Files\nodejs\npm.cmd' run db:seed
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run start -- --port 3196
```

6. Open `Settings > Facebook` and confirm the runtime diagnostics are all configured.
7. Enter or confirm the Facebook App ID, then click `Connect Facebook`.
8. Complete Meta authorization and, if multiple Pages are returned, choose the Page to attach.
9. Click `Test Connection` and confirm:
   - connected Page name and Page id are shown
   - granted scopes are listed
   - missing required scopes show `None`
   - last tested time updates
   - connection status stays `CONNECTED`
10. Click `Run Facebook Diagnostics` and confirm:
    - token exchange status is shown
    - the short-lived and long-lived token sources are listed without exposing the token values
    - `/me` returns the expected Facebook user
    - `/me/accounts` shows the raw data count and whether `access_token` is present per row
    - if `/me/accounts` is empty, `/me/businesses` and fallback endpoints are shown
11. If needed, enter a known Page ID in `Test Page ID` and run the manual Page ID test.
12. Create a draft with caption only and use `Post Now`.
13. Create a draft with an original uploaded image and use `Post Now`.
14. Schedule a Facebook post about two minutes out.
13. Run the worker:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run worker:publish
```

15. Confirm the scheduled post becomes `PUBLISHED` or `FAILED`, then review:
    - the dashboard worker card
    - the post detail page
    - the Facebook post link if returned
    - the latest publish attempt summary
    - the full publish attempt history
    - the calendar status color/state
16. If a post fails, use `Retry Publish` from the post detail page and confirm a new publish attempt is added instead of overwriting prior failure details.
17. Run `npm run media:cleanup-temp` and confirm stale temporary publish files are removed cleanly.
18. Run `npm run media:cleanup-variants` only when you are ready to remove old stored derivatives and confirm originals remain untouched.
17. If a future-scheduled post is posted manually, confirm the UI requires the explicit immediate-publish confirmation step first.
18. Restart the app and confirm the Facebook Page still appears connected without reconnecting.
19. Use `Post Now` again after restart and confirm the saved Facebook connection is reused.
20. Schedule a Facebook post after restart and confirm the worker uses the saved connection without reconnecting.
21. Simulate an invalid token or expired token and confirm:
    - the publish is blocked with a readable reconnect message
    - the post moves to `FAILED`
    - a failed publish attempt is created
    - the dashboard notification bell shows a red unread badge
22. Click the dashboard notification and confirm it opens `Settings > Facebook`.
23. Click `Reconnect Facebook`, complete OAuth again, and confirm:
    - the existing connection record updates in place
    - the token warning notification is dismissed
    - `Test Connection` succeeds again
24. Disconnect Facebook, reconnect it, and confirm the Page details repopulate without exposing the token in the UI.
25. Restart the app and rerun `npm run worker:publish`, then confirm scheduled publishing still resumes from the current database state.

## Facebook Diagnostic Checklist

- Confirm granted scopes.
- Confirm `/me` returns the expected Facebook user.
- Confirm `/me/accounts` raw response.
- Confirm whether Page access tokens are present.
- If `/me/accounts` is empty, check `/me/businesses` and `assigned_pages`.
- If Business Manager pages appear only in fallback, add `business_management`.
- If Graph API Explorer returns Pages but the app does not, compare Graph API version, token source, and redirect app ID.
