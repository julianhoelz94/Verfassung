#!/bin/sh
set -eu
# Export the public root only. Installing host trust is a separate operator action.
target="${1:-/tmp/constitution-atlas-local-root.crt}"
docker compose --env-file env/local-stack.env exec -T edge-proxy cat /data/caddy/pki/authorities/local/root.crt > "$target"
printf 'Public local CA certificate exported to %s\n' "$target"
printf 'Review it, then install it in your operating system/browser trust store. No trust changes were made.\n'
