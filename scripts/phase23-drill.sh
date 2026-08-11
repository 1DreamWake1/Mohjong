#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${AUTH_TOKEN_SECRET:-}" || -z "${POSTGRES_PASSWORD:-}" || -z "${DATABASE_URL:-}" ]]; then
  echo "Set AUTH_TOKEN_SECRET, POSTGRES_PASSWORD and DATABASE_URL before running the phase 23 drill." >&2
  exit 2
fi

compose=(docker compose -f compose.yaml -f compose.scale.yaml --profile scale)
cleanup() {
  "${compose[@]}" down ${DRILL_CLEAN_VOLUMES:+--volumes} || true
}
trap cleanup EXIT

"${compose[@]}" config --quiet
"${compose[@]}" up -d --build --wait --scale server=2

ready_url="${DRILL_BASE_URL:-http://127.0.0.1:8080}/ready"
curl_probe=(curl --fail --silent --show-error --max-time "${DRILL_CURL_TIMEOUT:-10}")
wait_ready() {
  local attempts="${DRILL_READY_ATTEMPTS:-30}"
  local delay="${DRILL_READY_DELAY:-2}"
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if "${curl_probe[@]}" "$ready_url" >/dev/null; then
      return 0
    fi
    sleep "$delay"
  done
  echo "Readiness probe did not recover: $ready_url" >&2
  return 1
}
server_ready() {
  local container
  container=$("${compose[@]}" ps --status running -q server | head -n 1)
  [[ -n "$container" ]] || return 1
  docker exec "$container" node -e "fetch('http://127.0.0.1:3000/ready').then(r=>{if(!r.ok)process.exit(1);process.exit(0)}).catch(()=>process.exit(1))" >/dev/null
}
wait_server_ready() {
  local attempts="${DRILL_READY_ATTEMPTS:-30}"
  local delay="${DRILL_READY_DELAY:-2}"
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if server_ready; then return 0; fi
    sleep "$delay"
  done
  echo "Server readiness did not recover" >&2
  return 1
}
"${curl_probe[@]}" "$ready_url" >/dev/null

server_count=$("${compose[@]}" ps -q server | wc -l | tr -d ' ')
if [[ "$server_count" -lt 2 ]]; then
  echo "Expected two server containers, found $server_count" >&2
  exit 1
fi

echo "Creating and listing a PostgreSQL custom-format backup"
"${compose[@]}" exec -T server node ./apps/server/dist/scripts/dbbackup.js create
"${compose[@]}" exec -T server node ./apps/server/dist/scripts/dbbackup.js list
backup_file=$("${compose[@]}" exec -T server sh -c 'ls -1t /app/backups/*.dump | head -n 1' | tr -d '\r' | xargs -r basename)
if [[ -z "$backup_file" ]]; then
  echo "No PostgreSQL backup file was created" >&2
  exit 1
fi
"${compose[@]}" exec -T server node ./apps/server/dist/scripts/dbbackup.js verify "$backup_file"

echo "Testing PostgreSQL restore"
"${compose[@]}" stop server
"${compose[@]}" run --rm --no-deps --entrypoint node server ./apps/server/dist/scripts/dbbackup.js restore "$backup_file"
"${compose[@]}" up -d --no-deps --scale server=2 server
wait_server_ready

echo "Testing Redis outage and reconnect"
"${compose[@]}" stop redis
"${curl_probe[@]}" "$ready_url" >/dev/null
"${compose[@]}" start redis
"${compose[@]}" up -d --no-deps redis
wait_server_ready

echo "Testing database outage and recovery"
"${compose[@]}" stop postgres
if server_ready; then
  echo "Readiness remained healthy while PostgreSQL was stopped" >&2
  exit 1
fi
"${compose[@]}" start postgres
"${compose[@]}" up -d --no-deps postgres
"${compose[@]}" up -d --no-deps --scale server=2 server
wait_server_ready

echo "Testing one server failure with the second instance still serving"
first_server=$("${compose[@]}" ps -q server | head -n 1)
docker stop "$first_server" >/dev/null
wait_server_ready

echo "Phase 23 drill passed"
