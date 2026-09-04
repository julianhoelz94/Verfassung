#!/usr/bin/env bash
set -euo pipefail

# manageLocalStack.sh — start/stop/rebuild/reset the local Compose stack (Caddy :80).
# Usage: manageLocalStack.sh --start|--stop|--status|--rebuild [service...]|--reset [--prune]|--help

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

ENV_FILE="env/local-stack.env"
COMPOSE_CMD=(docker compose --progress=plain)
if [ "${COMPOSE_VERBOSE:-}" = "1" ]; then
  COMPOSE_CMD+=(--verbose)
fi

# Compose service names — keep in sync with docker-compose.yml.
# Kotlin images copy a host bootJar (app.jar); gateway-web and edge-proxy still build in Docker.
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
HTTP_READY_TIMEOUT_SECONDS="${HTTP_READY_TIMEOUT_SECONDS:-90}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"

compose() {
  "${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" "$@"
}

caddy_port() {
  local port="${CADDY_PORT:-80}"
  if [ -f "${ENV_FILE}" ]; then
    local from_file
    from_file="$(grep -E '^CADDY_PORT=' "${ENV_FILE}" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
    if [ -n "${from_file}" ]; then
      port="${from_file}"
    fi
  fi
  echo "${port}"
}

print_urls() {
  local port host
  port="$(caddy_port)"
  if [ "${port}" = "80" ]; then
    host="http://localhost"
  else
    host="http://localhost:${port}"
  fi
  cat <<EOF

Local stack (Caddy is the only host entry):
  App           ${host}
  Search        ${host}/search
  Compare (DE)  ${host}/countries/DE/compare
  Timeline (DE) ${host}/countries/DE/timeline
  Editor        ${host}/login
  API docs      ${host}/api/docs/<service>/swagger-ui/index.html
                services: catalog content amendment identity editor search ingestion audit
EOF
}

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

ensure_env_file() {
  if [ ! -f "${ENV_FILE}" ]; then
    echo "Missing ${ENV_FILE}; copying from ${ENV_FILE}.example"
    cp "${ENV_FILE}.example" "${ENV_FILE}"
  fi
}

ensure_disk_space() {
  local avail_kb avail_mb
  avail_kb="$(df -Pk "${ROOT}" | awk 'NR==2 { print $4 }')"
  avail_mb=$((avail_kb / 1024))
  if [ "${avail_mb}" -lt "${MIN_FREE_MB}" ]; then
    echo "Only ${avail_mb} MiB free under ${ROOT} (need ${MIN_FREE_MB} MiB)."
    echo "Free disk space (or set MIN_FREE_MB) before building images. Gradle/Docker builds fail hard when the disk is full."
    exit 1
  fi
}

wait_for_http() {
  local port url waited=0
  port="$(caddy_port)"
  url="http://127.0.0.1:${port}/"
  until curl -sf -o /dev/null --max-time 2 "${url}"; do
    if [ "${waited}" -ge "${HTTP_READY_TIMEOUT_SECONDS}" ]; then
      echo "Caddy did not serve ${url} within ${HTTP_READY_TIMEOUT_SECONDS}s. Check: ${COMPOSE_CMD[*]} --env-file ${ENV_FILE} ps"
      return 0
    fi
    echo "Waiting for ${url}... (${waited}s/${HTTP_READY_TIMEOUT_SECONDS}s)"
    sleep 3
    waited=$((waited + 3))
  done
  echo "Ready at ${url}"
}

is_known_service() {
  local name="$1"
  local s
  for s in "${BUILD_ORDER[@]}"; do
    if [ "${s}" = "${name}" ]; then
      return 0
    fi
  done
  return 1
}

normalize_service() {
  local raw="$1"
  case "${raw}" in
    catalog|content|amendment|identity|editor|search|ingestion|audit)
      echo "${raw}-service"
      ;;
    caddy|proxy)
      echo "edge-proxy"
      ;;
    gateway|web)
      echo "gateway-web"
      ;;
    *)
      echo "${raw}"
      ;;
  esac
}

is_kotlin_service() {
  case "$1" in
    *-service) return 0 ;;
    *) return 1 ;;
  esac
}

build_services() {
  local service
  for service in "$@"; do
    if is_kotlin_service "${service}"; then
      echo "======== bootJar ${service} (host) ========"
      ./gradlew -p "services/${service}" bootJar -x test
    fi
  done
  for service in "$@"; do
    echo "======== Building ${service} ========"
    compose build "${service}"
  done
}

usage() {
  local code="${1:-1}"
  cat <<EOF
Usage: $0 <command> [args]

Commands:
  --start [--no-build]     Host bootJar for Kotlin services, image build, then up -d
  --rebuild <service...>   Host bootJar if Kotlin, rebuild images, recreate containers
  --stop                   Stop containers; keep named Postgres volumes
  --status                 Show compose ps
  --reset [--prune]        down -v --remove-orphans. --prune also docker system prune -af
  --help                   This message

Services (compose names, or short: catalog, content, …, gateway, caddy):
  ${BUILD_ORDER[*]}

Rebuild catalog or content also recreates search-service (SEARCH_REINDEX_ON_STARTUP).
Env: COMPOSE_VERBOSE=1  MIN_FREE_MB=${MIN_FREE_MB}  HTTP_READY_TIMEOUT_SECONDS=${HTTP_READY_TIMEOUT_SECONDS}
EOF
  exit "${code}"
}

if [ "$#" -lt 1 ]; then
  usage 1
fi

COMMAND="$1"
shift || true

case "${COMMAND}" in
  --help|-h)
    usage 0
    ;;

  --start)
    NO_BUILD=0
    if [ "${1:-}" = "--no-build" ]; then
      NO_BUILD=1
    elif [ "$#" -gt 0 ]; then
      usage 1
    fi
    ensure_docker_running
    ensure_env_file
    echo "Starting local stack using ${ENV_FILE}..."
    if [ "${NO_BUILD}" -eq 0 ]; then
      ensure_disk_space
      build_services "${BUILD_ORDER[@]}"
    fi
    echo "======== Starting containers (no rebuild) ========"
    compose up -d --no-build --remove-orphans
    echo "======== Container status ========"
    compose ps
    wait_for_http
    print_urls
    echo "Started."
    ;;

  --rebuild)
    if [ "$#" -lt 1 ]; then
      echo "Specify at least one service to rebuild."
      usage 1
    fi
    ensure_docker_running
    ensure_env_file
    ensure_disk_space
    SERVICES=()
    NEED_SEARCH=0
    for raw in "$@"; do
      svc="$(normalize_service "${raw}")"
      if ! is_known_service "${svc}"; then
        echo "Unknown service '${raw}' (resolved '${svc}')."
        usage 1
      fi
      SERVICES+=("${svc}")
      case "${svc}" in
        catalog-service|content-service|search-service) NEED_SEARCH=1 ;;
      esac
    done
    if [ "${NEED_SEARCH}" -eq 1 ]; then
      HAS_SEARCH=0
      for svc in "${SERVICES[@]}"; do
        if [ "${svc}" = "search-service" ]; then
          HAS_SEARCH=1
        fi
      done
      if [ "${HAS_SEARCH}" -eq 0 ]; then
        SERVICES+=("search-service")
        echo "Also recreating search-service so the derived index rebuilds from catalog/content."
      fi
    fi
    build_services "${SERVICES[@]}"
    echo "======== Recreating ${SERVICES[*]} ========"
    compose up -d --no-build --remove-orphans --force-recreate "${SERVICES[@]}"
    compose ps
    wait_for_http
    print_urls
    echo "Rebuilt."
    ;;

  --stop)
    ensure_docker_running
    echo "Stopping local stack..."
    compose down --remove-orphans
    echo "Stopped (named database volumes kept)."
    ;;

  --status)
    ensure_docker_running
    ensure_env_file
    compose ps
    print_urls
    ;;

  --reset)
    PRUNE=0
    if [ "${1:-}" = "--prune" ]; then
      PRUNE=1
    elif [ "$#" -gt 0 ]; then
      usage 1
    fi
    ensure_docker_running
    echo "Resetting local stack (this removes named database volumes)..."
    compose down -v --remove-orphans || true
    if [ "${PRUNE}" -eq 1 ]; then
      echo "Pruning unused containers, networks, images, and build cache..."
      docker system prune -af
      echo "Pruning leftover unused volumes..."
      docker volume prune -af
    else
      echo "Skipped docker system prune (pass --reset --prune to reclaim images/cache)."
    fi
    echo "Reset complete."
    ;;

  *)
    usage 1
    ;;
esac
