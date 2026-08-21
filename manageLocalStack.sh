#!/usr/bin/env bash
set -euo pipefail

# manageLocalStack.sh — simple helper to start/stop/reset the local docker compose stack
# Usage: manageLocalStack.sh --start|--stop|--reset

ENV_FILE="env/local-stack.env"
COMPOSE_CMD="docker compose --progress=plain --verbose"

# Build memory-heavy images sequentially to avoid Docker Desktop OOM during startup.
# edge-proxy is cheap but must be built: `up --no-build` will not create it.
BUILD_ORDER=(
  edge-proxy
  gateway-web
  catalog-service
  content-service
  amendment-service
  identity-service
  editor-service
  search-service
  ingestion-service
  audit-service
)

DOCKER_STARTUP_TIMEOUT_SECONDS="${DOCKER_STARTUP_TIMEOUT_SECONDS:-120}"

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  echo "Docker daemon is not reachable."

  if [ "$(uname -s)" = "Darwin" ]; then
    echo "Attempting to start Docker Desktop..."
    open -a Docker
  fi

  local waited=0
  until docker info >/dev/null 2>&1; do
    if [ "$waited" -ge "$DOCKER_STARTUP_TIMEOUT_SECONDS" ]; then
      echo "Docker did not become ready within ${DOCKER_STARTUP_TIMEOUT_SECONDS}s."
      echo "Please start Docker manually and run the script again."
      exit 1
    fi

    echo "Waiting for Docker daemon... (${waited}s/${DOCKER_STARTUP_TIMEOUT_SECONDS}s)"
    sleep 2
    waited=$((waited + 2))
  done

  echo "Docker daemon is ready."
}

usage() {
  cat <<EOF
Usage: $0 [--start|--stop|--reset]

Options:
  --start   Start the local stack (detached)
  --stop    Stop the local stack (keeps named database volumes)
  --reset   Stop the stack, remove database volumes, and prune Docker (destructive)
EOF
  exit 1
}

if [ "$#" -ne 1 ]; then
  usage
fi

case "$1" in
  --start)
    ensure_docker_running
    if [ ! -f "${ENV_FILE}" ]; then
      echo "Missing ${ENV_FILE}; copying from ${ENV_FILE}.example"
      cp "${ENV_FILE}.example" "${ENV_FILE}"
    fi
    echo "Starting local stack using ${ENV_FILE}..."
    echo "Compose command: ${COMPOSE_CMD}"

    for service in "${BUILD_ORDER[@]}"; do
      echo "======== Building ${service} ========"
      ${COMPOSE_CMD} --env-file "${ENV_FILE}" build "${service}"
    done

    echo "======== Starting containers (no rebuild) ========"
    ${COMPOSE_CMD} --env-file "${ENV_FILE}" up -d --no-build
    echo "======== Container status ========"
    ${COMPOSE_CMD} --env-file "${ENV_FILE}" ps
    echo "Started."
    ;;

  --stop)
    ensure_docker_running
    echo "Stopping local stack..."
    ${COMPOSE_CMD} --env-file "${ENV_FILE}" down
    echo "Stopped."
    ;;

  --reset)
    ensure_docker_running
    echo "Resetting local stack (this removes named database volumes and prunes Docker)..."
    # -v removes compose-declared volumes (Postgres data). Plain `down` keeps them.
    ${COMPOSE_CMD} --env-file "${ENV_FILE}" down -v --remove-orphans || true
    echo "Pruning unused containers, networks, images, and build cache..."
    docker system prune -af
    echo "Pruning leftover unused volumes..."
    docker volume prune -af
    echo "Reset complete."
    ;;

  *)
    usage
    ;;
esac
