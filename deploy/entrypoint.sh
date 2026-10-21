#!/bin/sh
set -eu
# Refresh the bundled catalog without replacing the persistent SQLite database.
cp /app/seed/catalog.json /app/data/catalog.json
exec "$@"
