#!/usr/bin/env bash
set -euo pipefail
cd /home/web/insta

LOCK=/var/lock/insta-deploy.lock

# Orphaned deploy.sh from dropped Actions SSH sessions keep the flock forever.
# Kill holders hard, then recreate the lock file.
self=$$
while read -r pid; do
  [[ -n "${pid}" && "${pid}" != "${self}" ]] || continue
  echo "Stopping orphaned deploy pid=${pid}"
  kill -9 "${pid}" 2>/dev/null || true
done < <(pgrep -f '/home/web/insta/deploy/deploy.sh' || true)
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${LOCK}" 2>/dev/null || true
fi
sleep 2
rm -f "${LOCK}"

exec 9>"${LOCK}"
if ! flock -w 30 9; then
  echo "Could not acquire ${LOCK} within 30s" >&2
  exit 1
fi

# Compose requires PANEL_PASSWORD. .env is not uploaded by rsync; create one if missing.
ensure_panel_env() {
  local env_file=/home/web/insta/.env
  local current=""
  if [[ -f "$env_file" ]]; then
    current=$(grep -E '^PANEL_PASSWORD=' "$env_file" | tail -n1 | cut -d= -f2- || true)
  fi
  if [[ -n "${current}" ]]; then
    return 0
  fi
  local pass
  pass=$(openssl rand -base64 24 | tr -d '/+=\n' | head -c 24)
  umask 077
  if [[ -f "$env_file" ]]; then
    grep -vE '^PANEL_(USER|PASSWORD)=' "$env_file" >"${env_file}.tmp" || true
    mv "${env_file}.tmp" "$env_file"
  else
    : >"$env_file"
  fi
  {
    echo "PANEL_USER=admin"
    echo "PANEL_PASSWORD=${pass}"
  } >>"$env_file"
  chmod 600 "$env_file"
  echo "============================================================"
  echo "Created /home/web/insta/.env with a new panel password."
  echo "PANEL_USER=admin"
  echo "PANEL_PASSWORD=${pass}"
  echo "Save it now — it will not be printed on later deploys."
  echo "============================================================"
}

# Heartbeats keep the Actions SSH TCP session alive during quiet npm ci layers.
build_with_heartbeat() {
  docker compose build --progress=plain &
  local build_pid=$!
  while kill -0 "${build_pid}" 2>/dev/null; do
    echo "[deploy] building… $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    sleep 20
  done
  if ! wait "${build_pid}"; then
    echo "[deploy] docker compose build failed" >&2
    return 1
  fi
  echo "[deploy] image build finished"
}

ensure_panel_env
docker compose config --quiet
build_with_heartbeat
# Take a consistent SQLite backup before changing the running application.
mkdir -p /home/web/insta-backups
if docker compose ps --status running --services | grep -qx app; then
  docker compose exec -T app node --experimental-sqlite --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    import { existsSync, unlinkSync } from "node:fs";
    const file = "/app/data/pre-deploy.sqlite";
    if (existsSync(file)) unlinkSync(file);
    const db = new DatabaseSync("/app/data/concierge.sqlite");
    db.prepare("VACUUM INTO ?").run(file);
    db.close();
  '
  docker compose cp app:/app/data/pre-deploy.sqlite "/home/web/insta-backups/$(date -u +%Y%m%dT%H%M%SZ).sqlite"
  chmod 600 /home/web/insta-backups/*.sqlite
fi
docker compose up -d --wait --wait-timeout 180 --remove-orphans
docker compose ps
