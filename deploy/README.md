# Production: insta.iordani.info

- VPS: `104.248.120.210`, SSH alias `revelio-ny`, port `2222`.
- Local checkout: `/Users/mobypolo/Documents/Repos/revelio/insta`.
- Server source: `/home/web/insta`.
- Docker Compose project `insta`; app listens only on `127.0.0.1:4317`.
- SQLite and the catalog live in named volume `insta_app-data` mounted at `/app/data`.
  Never run `docker compose down -v` on production.
- The Node process refreshes the catalog from iordani.com about once an hour
  (`CATALOG_SYNC_INTERVAL_MS`, default `3600000`). A failed crawl keeps the
  previous snapshot and retries after `CATALOG_SYNC_RETRY_MS` (default 15 min).
- The app itself requires Basic Auth via `PANEL_USER` / `PANEL_PASSWORD` (compose
  reads them from the host environment or a `.env` next to `compose.yaml`).
  Without `PANEL_PASSWORD` the container will not start. `/api/instagram/webhook`
  and `/api/health` stay public; webhook POSTs are rejected unless App Secret is
  saved in the panel and `X-Hub-Signature-256` matches.
- nginx may still keep an outer Basic Auth as defense in depth; credentials for
  that layer stay outside Git in `/etc/nginx/insta.htpasswd`.

## GitHub Actions

Pushes to `main` and manual workflow dispatch run `.github/workflows/deploy.yml`.
Create repository Actions secret **`DEPLOY_SSH_KEY`** with the complete private
key from `/Users/mobypolo/.ssh/insta_deploy` (including BEGIN/END lines).
The matching public key is installed on this VPS; the host key is pinned in the workflow.

GitHub Actions uploads the checkout, builds and tests the Docker image, backs up
SQLite, and recreates the container with a health check. Jobs do not cancel an
in-progress deployment. VPS access to GitHub is not required.

Compose needs `PANEL_PASSWORD` on the VPS in `/home/web/insta/.env` (not in Git).
If that file is missing, `deploy/deploy.sh` creates one with a random password and
prints it once in the deploy log. To rotate later:

```sh
ssh revelio-ny 'nano /home/web/insta/.env'   # set PANEL_USER / PANEL_PASSWORD
ssh revelio-ny 'cd /home/web/insta && docker compose up -d'
```

Manual deploy from the local checkout:

```sh
rsync -az --delete --exclude='.git/' --exclude='node_modules/' --exclude='.next/' \
  --exclude='.env*' ./ revelio-ny:/home/web/insta/
ssh revelio-ny 'bash /home/web/insta/deploy/deploy.sh'
```

Backups are consistent SQLite snapshots in `/home/web/insta-backups`, outside the
uploaded tree. The deployment preserves the named volume. To roll back code,
revert the relevant commit and push to `main`. A failed image build leaves the
running container untouched; a failed health check requires operator inspection.

## DNS and HTTPS

The DNS owner must set `A insta.iordani.info` to `104.248.120.210`. Do not add an
AAAA record unless IPv6 is configured for this VPS. DNS is managed externally.

The `insta-https.timer` checks hourly. Once DNS resolves solely to this VPS IPv4,
`insta-enable-https` requests a Let's Encrypt certificate and configures nginx
with HTTPS and an HTTP redirect. Subsequent renewal uses `certbot.timer`.
It waits while DNS differs. To request immediately after DNS changes:

```sh
ssh revelio-ny 'systemctl start insta-https.service'
```

Before DNS points here, use an SSH tunnel to inspect the panel without sending
credentials over HTTP:

```sh
ssh -N -L 4317:127.0.0.1:4317 revelio-ny
# Open http://localhost:4317
```

After HTTPS is live, configure Meta callback
`https://insta.iordani.info/api/instagram/callback` and webhook
`https://insta.iordani.info/api/instagram/webhook` in the Instagram application.
Instagram account setup is performed in the panel; it is not part of deployment.

## Operations

```sh
ssh revelio-ny 'cd /home/web/insta && docker compose ps'
ssh revelio-ny 'cd /home/web/insta && docker compose logs --tail=100 app'
ssh revelio-ny 'nginx -t; systemctl list-timers insta-https.timer certbot.timer'
```

Infrastructure files in `deploy/` are installed on the host during initial setup;
normal application deployments do not overwrite nginx or certificates. After
changing infrastructure files, install them explicitly and validate nginx before
reloading it.
