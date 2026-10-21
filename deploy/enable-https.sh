#!/usr/bin/env bash
set -euo pipefail
# Retry automatically after DNS is pointed here. Certbot manages renewal afterward.
if test -f /etc/letsencrypt/live/insta.iordani.info/fullchain.pem; then
  exit 0
fi
python3 - <<'PY'
import socket, sys
try:
    addresses = {r[4][0] for r in socket.getaddrinfo('insta.iordani.info', 80, type=socket.SOCK_STREAM)}
except socket.gaierror:
    sys.exit(1)
sys.exit(0 if addresses == {'104.248.120.210'} else 1)
PY
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d insta.iordani.info
