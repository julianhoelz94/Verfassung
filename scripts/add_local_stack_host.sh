#!/usr/bin/env bash
set -euo pipefail

# add_local_stack_host.sh
# Usage: sudo ./add_local_stack_host.sh
# Adds 127.0.0.1 local-stack.verfassungen.de to /etc/hosts (idempotent)

HOSTS_FILE="/etc/hosts"
HOSTNAME="local-stack.verfassungen.de"
IP="127.0.0.1"

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run with sudo. Example: sudo $0"
  exit 1
fi

if grep -qE "(^|\s)${HOSTNAME}($|\s)" "$HOSTS_FILE"; then
  echo "${HOSTNAME} already exists in ${HOSTS_FILE}. No changes made."
  exit 0
fi

BACKUP="/etc/hosts.backup.$(date +%s)"
cp "$HOSTS_FILE" "$BACKUP"
echo "Backed up ${HOSTS_FILE} to ${BACKUP}"

echo -e "${IP}\t${HOSTNAME}" >> "$HOSTS_FILE"
echo "Appended '${IP} ${HOSTNAME}' to ${HOSTS_FILE}"

# Flush macOS DNS cache (best-effort)
if command -v dscacheutil >/dev/null 2>&1; then
  dscacheutil -flushcache || true
fi
if command -v killall >/dev/null 2>&1; then
  killall -HUP mDNSResponder >/dev/null 2>&1 || true
fi

echo "Done. You can now reach the local stack at: http://${HOSTNAME}/ or https://${HOSTNAME}/ (depending on proxy)."
