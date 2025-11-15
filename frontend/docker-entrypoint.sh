#!/bin/sh
set -euo pipefail

: "${PORT:=8080}"
: "${API_BASE_URL:=}"

cat <<EOF > /app/dist/config.js
window.__APP_CONFIG__ = {
  API_BASE_URL: "${API_BASE_URL}"
};
EOF

exec serve -s dist -l "$PORT"

