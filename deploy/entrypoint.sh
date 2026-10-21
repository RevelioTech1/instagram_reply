#!/bin/sh
set -eu
# Seed only a new volume: catalog sync writes its newer snapshot into this file.
if [ ! -f /app/data/catalog.json ]; then
  cp /app/seed/catalog.json /app/data/catalog.json
fi
exec "$@"
