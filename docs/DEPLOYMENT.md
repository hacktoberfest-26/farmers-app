# Deploy Farmers

The static PWA uses GitHub Pages at `https://farmers.johno.it`. Its Node.js API uses SQLite on a dedicated DigitalOcean Droplet at `https://api.farmers.johno.it`.

## Publish the frontend

1. Set the repository's Pages source to **GitHub Actions**.
2. Set the custom domain to `farmers.johno.it` and enable **Enforce HTTPS** after GitHub issues its certificate.
3. Point the Gandi `farmers` CNAME to `johnou.github.io.`.
4. Push to `main`. `.github/workflows/pages.yml` installs dependencies, checks TypeScript, runs tests, builds `out/`, and deploys Pages.

The workflow defaults `NEXT_PUBLIC_API_URL` to `https://api.farmers.johno.it`. Override that public setting with a repository Actions variable to use another API. The custom domain uses an empty base path. Without a custom domain, the repository path is `/HCommunity`, not `/Farmers`. Configure Pages supplies the base path during the build.

For a local browser demo, run `npm run dev` without `NEXT_PUBLIC_API_URL`. Browser demo data belongs to that browser and origin.

## Provision the API

The deployed host is `farmers-api` in Amsterdam, with 1 GB memory and a US$6/month base price. Its public IPv4 address is `188.166.3.196`. Gandi's `api.farmers` A record points to this address. The application directory is `/opt/hcommunity`.

For a replacement Ubuntu host, run `ops/provision-droplet.sh` to install Docker and enable the host firewall for SSH, HTTP, and HTTPS. Copy the repository's server sources, shared `src/lib`, `tsconfig.json`, `compose.server.yml`, and `ops/Caddyfile` to the application directory.

Create a private environment file beside `compose.server.yml`:

```sh
cp server/.env.example .env
chmod 600 .env
mkdir -p backups
sudo chown 1000:1000 backups
```

Set these values in `.env`:

```dotenv
API_DOMAIN=api.farmers.johno.it
API_HOST=0.0.0.0
PORT=8080
SQLITE_PATH=/data/farmers.sqlite
CORS_ORIGIN=https://farmers.johno.it
BOOTSTRAP_ADMIN_EMAIL=operator@example.org
BOOTSTRAP_ADMIN_PASSWORD=<unique random password of at least 16 characters>
USE_DEMO_DATA=false
```

Startup creates the administrator from these private settings before public registration opens. Public registrations always start pending. Sign in as the administrator, complete onboarding, and approve members through the admin screen. Bootstrap settings create a missing account. Changing the password setting does not reset an existing account.

The API has no email verification or password recovery service. Email addresses and adult attestations are not verified. The seed includes sample guides and unverified venues, but `USE_DEMO_DATA=false` excludes fictional accounts and social activity.

## Start and update the API

```sh
docker compose -f compose.server.yml up -d --build
docker compose -f compose.server.yml ps
curl --fail https://api.farmers.johno.it/health
```

Expect the API container to become healthy and the health endpoint to return `{"status":"ok"}`. Caddy obtains and renews its HTTPS certificate. Port 8080 is private to the Docker network. Caddy publishes ports 80 and 443.

The container uses Node.js 24 and starts `server/src/main.ts` with `tsx`. Run one API instance against the SQLite volume. The persistent volume survives container rebuilds. Keep the volume when updating the application.

## Back up and restore SQLite

Use the bundled online backup utility while the API runs:

```sh
docker compose -f compose.server.yml exec api node /app/server/backup.mjs /backups/farmers-backup.sqlite
```

Use a fresh dated filename for each backup. Store a protected copy off the Droplet. The server disk and a Docker volume are not separate backups.

To test a restore, copy a backup into a separate staging volume, set `SQLITE_PATH` to the copied file, and start a staging API. Check health, account login, and community data before replacing any live database. Stop the live API before replacing its database and preserve the previous file.

## Check a deployment

Check sign-in, onboarding, pending membership, admin approval, session participation, connections, messaging, and logout with separate accounts. Confirm the API sends the exact frontend CORS origin. Frontend API configuration is compiled into the bundle, so changing it requires another Pages build.

The service worker caches previously loaded static assets. API mode requires network access and does not cache private API responses. Interactive commands show an error while offline. Browser demo SQLite also requires an initial download of its bundled WebAssembly runtime.

## Configure hosted Gemma and the shared presentation

Set `BACKBOARD_API_KEY`, `BACKBOARD_PROVIDER=openrouter`, and `BACKBOARD_MODEL=google/gemma-4-26b-a4b-it` in the private server `.env`. The model was verified through Backboard's catalogue and real inference calls from DigitalOcean. Model selection remains configurable. Recreate the API container after changing private environment values.

Set a private `CAMPUS_DEMO_CODE` with at least eight characters to enable the shared fictional demo. Startup seeds twelve fictional accounts once; it does not overwrite profile edits on restart. These accounts have password login disabled and use their own demo access route. They cannot match live accounts, publish events to the live cohort, or reset the presentation themselves.

See [the multi-device demonstration guide](DEMO.md). Demo sign-in sessions expire after 24 hours. The frontend requires a new Pages build only when public build settings change; server secrets never belong in a Pages build.
