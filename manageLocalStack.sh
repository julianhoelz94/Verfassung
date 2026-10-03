#!/usr/bin/env bash
set -euo pipefail

# manageLocalStack.sh — start/stop/rebuild/reset the local Compose stack (Caddy :80).
# Usage: manageLocalStack.sh --start [--no-build] [--no-prepopulate]|--rebuild [--no-prepopulate] <service...>|--only-prepopulate|--stop|--status|--reset [--prune]|--help

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
  document-service
)

DOCKER_STARTUP_TIMEOUT_SECONDS="${DOCKER_STARTUP_TIMEOUT_SECONDS:-120}"
HTTP_READY_TIMEOUT_SECONDS="${HTTP_READY_TIMEOUT_SECONDS:-90}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"
GRADLE_BUILD_JOBS="${GRADLE_BUILD_JOBS:-2}"

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
                services: catalog content amendment identity editor search ingestion audit document
EOF
}

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  local context
  context="$(docker context show 2>/dev/null || true)"
  echo "Docker daemon is not reachable (context: ${context:-unknown})."

  if [ "$(uname -s)" = "Darwin" ]; then
    if [ "${context}" = "orbstack" ] || [[ "${DOCKER_HOST:-}" == *orbstack* ]]; then
      echo "Attempting to start OrbStack..."
      open -a OrbStack
    else
      echo "Attempting to start Docker Desktop..."
      open -a Docker
    fi
  fi

  local waited=0
  until docker info >/dev/null 2>&1; do
    if [ "$waited" -ge "$DOCKER_STARTUP_TIMEOUT_SECONDS" ]; then
      echo "Docker did not become ready within ${DOCKER_STARTUP_TIMEOUT_SECONDS}s."
      echo "Start the engine for context '${context:-unknown}' or select the intended context, then run the script again."
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
      return 1
    fi
    echo "Waiting for ${url}... (${waited}s/${HTTP_READY_TIMEOUT_SECONDS}s)"
    sleep 3
    waited=$((waited + 3))
  done
  echo "Ready at ${url}"
}

run_prepopulate() {
  local port service url waited
  port="$(caddy_port)"
  for service in catalog content amendment identity editor search ingestion audit; do
    url="http://127.0.0.1:${port}/api/${service}/ping"
    waited=0
    until curl -sf -o /dev/null --max-time 2 "${url}"; do
      if [ "${waited}" -ge "${HTTP_READY_TIMEOUT_SECONDS}" ]; then
        echo "${service} did not become ready at ${url} within ${HTTP_READY_TIMEOUT_SECONDS}s." >&2
        return 1
      fi
      sleep 3
      waited=$((waited + 3))
    done
  done
  echo "======== Prepopulating local stack ========"
  (
    cd "${ROOT}/apps/gateway-web"
    npm run fixtures:generate
    PREPOPULATE_TEST_STACK=true \
      PREPOPULATE_BASE_URL="http://127.0.0.1:${port}" \
      node --env-file="${ROOT}/${ENV_FILE}" e2e/fixtures/prepopulate.mjs
  )
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
  local service i failed=0 batch_failed
  local -a pids=()
  local -a running_services=()
  local -a log_files=()
  local -a statuses=()
  local log_dir
  case "${GRADLE_BUILD_JOBS}" in
    ''|*[!0-9]*) echo "GRADLE_BUILD_JOBS must be a positive integer." >&2; return 1 ;;
  esac
  if [ "${GRADLE_BUILD_JOBS}" -lt 1 ]; then
    echo "GRADLE_BUILD_JOBS must be a positive integer." >&2
    return 1
  fi

  log_dir="$(mktemp -d "${TMPDIR:-/tmp}/atlas-gradle-build.XXXXXX")"
  echo "======== Building Kotlin artifacts (up to ${GRADLE_BUILD_JOBS} in parallel) ========"

  for service in "$@"; do
    if is_kotlin_service "${service}"; then
      local_log="${log_dir}/${service}.log"
      log_files+=("${local_log}")
      echo "Queued ${service}"
      ./gradlew --console=plain -p "services/${service}" bootJar -x test >"${local_log}" 2>&1 &
      pids+=("$!")
      running_services+=("${service}")
      if [ "${#pids[@]}" -ge "${GRADLE_BUILD_JOBS}" ]; then
        batch_failed=0
        for ((i=0; i<${#pids[@]}; i++)); do
          if wait "${pids[i]}"; then statuses+=(0); else statuses+=(1); batch_failed=1; failed=1; fi
        done
        for ((i=0; i<${#pids[@]}; i++)); do
          if [ "${statuses[i]}" -eq 0 ]; then
            echo "  OK   ${running_services[i]}"
          else
            echo "  FAIL ${running_services[i]}" >&2
            sed "s/^/[${running_services[i]}] /" "${log_files[i]}" >&2
          fi
        done
        pids=()
        running_services=()
        log_files=()
        statuses=()
        if [ "${batch_failed}" -ne 0 ]; then
          rm -rf "${log_dir}"
          return 1
        fi
      fi
    fi
  done
  for ((i=0; i<${#pids[@]}; i++)); do
    if wait "${pids[i]}"; then statuses+=(0); else statuses+=(1); failed=1; fi
  done
  for ((i=0; i<${#pids[@]}; i++)); do
    if [ "${statuses[i]}" -eq 0 ]; then
      echo "  OK   ${running_services[i]}"
    else
      echo "  FAIL ${running_services[i]}" >&2
      sed "s/^/[${running_services[i]}] /" "${log_files[i]}" >&2
    fi
  done
  rm -rf "${log_dir}"
  if [ "${failed}" -ne 0 ]; then return 1; fi

  echo "======== Building images: $* ========"
  compose build "$@"
}

usage() {
  local code="${1:-1}"
  cat <<EOF
Usage: $0 <command> [args]

Commands:
  --start [--no-build] [--no-prepopulate]
                           Build and start the stack, then prepopulate it
  --only-prepopulate       Prepopulate an already running local stack
  --rebuild [--no-prepopulate] <service...>
                           Rebuild services, recreate containers, then prepopulate
  --stop                   Stop containers; keep named Postgres volumes
  --status                 Show compose ps
  --reset [--prune]        down -v --remove-orphans. --prune also docker system prune -af
  --help                   This message

Services (compose names, or short: catalog, content, …, gateway, caddy):
  ${BUILD_ORDER[*]}

Rebuild catalog or content also recreates search-service (SEARCH_REINDEX_ON_STARTUP).
Env: COMPOSE_VERBOSE=1  GRADLE_BUILD_JOBS=${GRADLE_BUILD_JOBS}  MIN_FREE_MB=${MIN_FREE_MB}  HTTP_READY_TIMEOUT_SECONDS=${HTTP_READY_TIMEOUT_SECONDS}
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
    NO_PREPOPULATE=0
    for option in "$@"; do
      case "${option}" in
        --no-build) NO_BUILD=1 ;;
        --no-prepopulate) NO_PREPOPULATE=1 ;;
        *) usage 1 ;;
      esac
    done
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
    if [ "${NO_PREPOPULATE}" -eq 0 ]; then
      run_prepopulate
    fi
    print_urls
    echo "Started."
    ;;

  --only-prepopulate|-only-prepopulate)
    if [ "$#" -gt 0 ]; then usage 1; fi
    ensure_env_file
    wait_for_http
    run_prepopulate
    ;;

  --rebuild)
    NO_PREPOPULATE=0
    SERVICES=()
    for raw in "$@"; do
      if [ "${raw}" = "--no-prepopulate" ]; then
        NO_PREPOPULATE=1
      else
        SERVICES+=("${raw}")
      fi
    done
    if [ "${#SERVICES[@]}" -lt 1 ]; then
      echo "Specify at least one service to rebuild."
      usage 1
    fi
    ensure_docker_running
    ensure_env_file
    ensure_disk_space
    REQUESTED_SERVICES=("${SERVICES[@]}")
    SERVICES=()
    NEED_SEARCH=0
    for raw in "${REQUESTED_SERVICES[@]}"; do
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
    if [ "${NO_PREPOPULATE}" -eq 0 ]; then
      run_prepopulate
    fi
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
