# SMM Scheduler Foundation

Self-hosted social media scheduler foundation built with Next.js App Router, TypeScript, Prisma, and MySQL.

This first pass intentionally stops short of real Facebook publishing and OAuth. It provides the secure admin shell, data model, media upload groundwork, scheduling/composer basics, calendar view, audit logging, and a placeholder publish worker we can extend in later prompts.

## Included

- Protected admin dashboard with session-cookie auth
- Admin-only login/logout
- Prisma schema and initial MySQL migration
- Environment-seeded admin account
- Draft/schedule post composer and edit flow
- Authenticated local media upload with metadata capture
- Monthly calendar view for scheduled posts
- Settings page for non-secret runtime config
- Audit logs for the key admin actions in this phase
- Placeholder publish worker for future cron/container execution

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

7. Start the app:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

8. Start the app on port `3196`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev -- --port 3196
```

9. Visit [http://127.0.0.1:3196](http://127.0.0.1:3196) and sign in with the seeded admin credentials.

## Environment Variables

Required or recommended values:

- `DATABASE_URL`: MySQL connection string
- `APP_URL`: absolute app origin used for same-origin checks
- `UPLOAD_DIR`: local upload directory, default `./uploads`
- `MAX_UPLOAD_BYTES`: max accepted upload size in bytes
- `SESSION_TTL_HOURS`: admin session lifetime
- `ADMIN_EMAIL`: seed admin email
- `ADMIN_PASSWORD`: seed admin password
- `FACEBOOK_APP_ID`: reserved for future Meta work
- `FACEBOOK_APP_SECRET`: reserved for future Meta work

## Security Notes

- No public registration flow exists.
- All dashboard pages require authentication.
- All write actions require authentication.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Passwords are hashed with `bcryptjs`.
- Uploads are validated server-side for size, type, and image dimensions.
- The upload path is generated server-side; client file metadata is not trusted.
- Uploads are stored outside the public web root by default.
- Audit records are written for login, logout, create/update/schedule post, settings save, and media upload.

## Upload Foundation

- Upload endpoint: `POST /api/admin/uploads`
- Current scope: single-image upload for the composer flow
- Stored metadata: original filename, MIME type, size, width, height, storage path
- Current behavior: stores original image only
- Next-phase hook: `src/lib/uploads.ts` includes TODOs for Sharp-based platform derivatives

## Publish Worker Placeholder

Run the placeholder worker manually with:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run worker:publish
```

Current behavior:

- finds due scheduled Facebook platform records
- claims them in a transaction by moving them to `PUBLISHING`
- creates a `PublishAttempt` with `SKIPPED_DEV_PLACEHOLDER`
- marks the post/platform as `FAILED` with a clear placeholder message

This is structured so we can later replace the placeholder branch with real Facebook Graph API publishing from a cron job or dedicated worker container.

## Docker Notes

- A starter [docker-compose.example.yml](/C:/Users/Corsair/Desktop/smm-dev/docker-compose.example.yml) is included for local self-hosted development.
- For this workstation, local testing is expected on `http://127.0.0.1:3196`.
- For your homelab dev deployment, set `APP_URL=https://smm-dev.nctilepros.com`.
- For production later, set `APP_URL=https://smm.nctilepros.com`.
- A production-oriented [Dockerfile](/C:/Users/Corsair/Desktop/smm-dev/Dockerfile) is included.
- Mount the uploads directory as a persistent volume.
- Run migrations and seed as explicit startup/deploy steps; they are not auto-run in the container image.
- Keep Facebook credentials in container environment variables, not in the database.

## Verification

Verified in this workspace:

- `npm install`
- `npm run prisma:generate`
- `npm run lint`
- `npm run build`

Not run here:

- MySQL-backed migration execution
- MySQL-backed seed execution
- end-to-end login/upload flows in a running browser session

Those last three steps require a running local database instance.
