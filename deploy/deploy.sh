#!/usr/bin/env bash
set -euo pipefail
cd /home/web/insta
exec 9>/var/lock/insta-deploy.lock
flock -w 900 9
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
