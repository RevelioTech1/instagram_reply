#!/usr/bin/env bash
set -euo pipefail
cd /home/web/insta
exec 9>/var/lock/insta-deploy.lock
flock -w 900 9

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

ensure_panel_env
docker compose config --quiet
docker compose build
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
