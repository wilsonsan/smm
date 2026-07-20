# Production Deployment

This guide takes the app from a fresh `git clone` to a live HTTPS deployment with:

- local MySQL inside Docker
- no public database port
- app bound only to `127.0.0.1`
- worker running continuously for scheduled posts
- HTTPS handled by a reverse proxy such as Caddy

This guide assumes:

- Docker and Docker Compose are already installed on the server
- Git is already installed
- your DNS already points the production domain at this server
- you want the database to stay private to Docker on the same machine

## Files Used

- [docker-compose.production.yml](/C:/Users/Corsair/Desktop/smm-dev/docker-compose.production.yml)
- [.env.production.example](/C:/Users/Corsair/Desktop/smm-dev/.env.production.example)

## 1. Clone The Repo

```bash
git clone <your-repo-url> smm
cd smm
```

## 2. Create The Production Env File

Copy the example file:

```bash
cp .env.production.example .env.production
```

Then edit `.env.production` and set real values for:

- `APP_URL`
- `APP_PORT`
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `TOKEN_ENCRYPTION_KEY`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Important notes:

- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are first-run bootstrap values only.
- After the first successful seed, the database becomes the source of truth.
- `TOKEN_ENCRYPTION_KEY` must stay the same across restarts and future redeploys.
- `APP_URL` must be the real public HTTPS URL.

## 3. Create Persistent Storage Folders

```bash
mkdir -p uploads
mkdir -p storage/mysql
```

These folders persist:

- original uploaded media
- MySQL data

## 4. Build The Production Images

```bash
docker compose --env-file .env.production -f docker-compose.production.yml build
```

The image build does not need direct database access and does not copy `.env.production` into the Docker build context.
Real runtime secrets are injected when the containers start through `env_file` and the Compose environment section.

## 5. Start The Database First

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d db
```

Wait until it is healthy:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

## 6. Run Migrations

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm app npm run prisma:migrate
```

## 7. Seed The Initial Admin

Run this only for the first deployment or when bootstrapping a brand-new database:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm app npm run db:seed
```

Expected behavior:

- if no users exist yet, the initial admin is created from env
- if users already exist, seed skips bootstrap and does not overwrite them

## 8. Start The App And Worker

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d app worker
```

Check status:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

You should see:

- `db` healthy
- `app` healthy
- `worker` healthy

## 9. Configure HTTPS Reverse Proxy

The production compose file binds the app to:

- `127.0.0.1:${APP_PORT}`

That means the app is only reachable locally on the server and should be exposed publicly through HTTPS with Caddy or another reverse proxy.

Example Caddyfile:

```caddy
your-domain.com {
  reverse_proxy 127.0.0.1:3196
}
```

If you changed `APP_PORT`, update the proxy target to match it.

## 10. Verify The App Internally Before Public Login

Check the combined health endpoint:

```bash
curl http://127.0.0.1:3196/api/health
```

Check the app-only probe:

```bash
curl http://127.0.0.1:3196/api/health/app
```

Tail the logs:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs -f app
```

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs -f worker
```

## 11. First Login

Open the public site:

- `https://your-domain.com/login`

Sign in with the seeded admin email and password from `.env.production`.

Immediately after first login:

1. open Account Settings
2. change the email if needed
3. change the password
4. enable MFA

## 12. Configure Social Channels

After login:

1. go to `Settings`
2. configure Facebook
3. configure Instagram through the linked Facebook Page and keep `META_INSTAGRAM_PUBLISHING_ENABLED=true`
4. configure Google Business Profile
5. test each active connection

Instagram content publishing uses `instagram_basic` and `instagram_content_publish`. Keep
`META_INSTAGRAM_COMMENTS_ENABLED=false`; the app does not request `instagram_manage_comments`
and does not publish Instagram first comments. Hashtags are included in the primary caption.

## 13. Scheduled Posting And Worker Monitoring

The `worker` service is required for scheduled posts.

This deployment now includes:

- a Docker healthcheck for the worker
- heartbeat tracking in the app
- stale worker detection
- backlog detection when scheduled posts are due but not being processed

Check worker health from Docker:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Check worker health in the app:

- `Settings > System Status`

That page now shows:

- app health
- database health
- worker health
- last worker run
- last worker heartbeat
- backlog visibility

## 14. Production Backups

Back up both of these:

- `storage/mysql`
- `uploads`

Recommended minimum:

- daily MySQL backup or host snapshot
- daily uploads backup
- keep both from the same backup window

Do not rotate `TOKEN_ENCRYPTION_KEY` casually. If it changes, encrypted connected-account secrets will no longer decrypt.

## 15. Future Deployments After Git Pull

From the repo directory:

```bash
git pull
```

```bash
docker compose --env-file .env.production -f docker-compose.production.yml build
```

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm app npm run prisma:migrate
```

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d app worker
```

Then verify:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

```bash
curl http://127.0.0.1:3196/api/health
```

## 16. Optional Redis Later

You said no external database is needed, and that is fully fine here.

If you later want stronger multi-instance rate limiting, add Redis and set:

- `REDIS_URL`

If `REDIS_URL` is blank, the app safely falls back to Prisma/database-backed rate limiting.

## 17. Production Launch Checklist

- `.env.production` created with real secrets
- `APP_URL` points to the final HTTPS domain
- reverse proxy configured
- `db`, `app`, and `worker` all healthy
- migrations applied
- initial admin seeded
- login tested
- password rotated
- MFA enabled
- Facebook connected
- Instagram professional account detected and publishing tested with `META_INSTAGRAM_PUBLISHING_ENABLED=true`
- Instagram comments disabled with `META_INSTAGRAM_COMMENTS_ENABLED=false`
- Google connected
- test post sent successfully
- scheduled post confirmed through worker
- backup plan in place
