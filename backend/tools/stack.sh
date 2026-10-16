#!/usr/bin/env bash
#
# Boot the WHOLE stack the way backend/render.yaml does - one OS process per Render service, each started with the blueprint's
# own start command (`node <dir>/src/server.js`, cwd backend/) and ONLY the environment the blueprint gives it - plus the
# monolith (pooja-api) as the shell the BFFs still probe. Used by CI (the `stack` job) and by hand to rehearse the cutover
# on a throwaway MongoDB. Unlike tools/dev-all.mjs it does not read any .env file (DOTENV_CONFIG_PATH=/dev/null).
#
#   MONGO_BASE=mongodb://127.0.0.1:27017 BASE_PORT=4300 tools/stack.sh start   # waits until every /health answers 200
#   BASE=http://127.0.0.1:4310 ADMIN_PASSWORD=ci-only-password node ../pooja-api/scripts/smoke.mjs
#   tools/stack.sh status | stop
#
# Ports (BASE_PORT + n): engagement 2, identity 3, catalog 4, wallet 5, orders 6, calls 7, monolith 8, events 9, mobile-bff 10, admin-bff 11.
# STACK_DIR (default /tmp/bhakti-stack) holds the logs and pids. NODE_ENV is development unless STACK_NODE_ENV=production
# (then the mock payment/audio providers are refused, exactly as on Render, and the BFFs get the production cookie/CORS shape).
# FIREBASE_SERVICE_ACCOUNT_PATH=/path/key.json gives the identity service the Firebase Admin key (real push delivery, account block/delete); without it
# identity runs unconfigured and push sends answer {sent:0}. Use a THROWAWAY Mongo with it: the key is real.
# BARE_URLS=1 passes every internal address as a bare host:port (what Render's fromService delivers) to prove the services add the scheme.
# MONGO_BASE must be a throwaway server: every service creates its own database on it, and the monolith one named `bhakti_shell` (both prefixed by DB_PREFIX if set).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$(cd "$HERE/.." && pwd)"
MONO="$(cd "$BACKEND/../pooja-api" && pwd)"
BASE_PORT="${BASE_PORT:-4300}"
MONGO_BASE="${MONGO_BASE:-mongodb://127.0.0.1:27017}"
STACK_DIR="${STACK_DIR:-/tmp/bhakti-stack}"
STACK_NODE_ENV="${STACK_NODE_ENV:-}"
DB_PREFIX="${DB_PREFIX:-}"   # prefix for every database name, so a second boot on the same server starts from empty collections
NODE_BIN="${NODE_BIN:-node}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ci-only-password}"
INTERNAL_JWT_SECRET="${INTERNAL_JWT_SECRET:-ci-internal-secret-0123456789abcdef}"
ADMIN_SESSION_SECRET="${ADMIN_SESSION_SECRET:-ci-session-secret-0123456789abcdef}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-ci-no-such-project}"

p() { echo $((BASE_PORT + $1)); }
ENG=$(p 2); IDN=$(p 3); CAT=$(p 4); WAL=$(p 5); ORD=$(p 6); CAL=$(p 7); MON=$(p 8); EVT=$(p 9); MOB=$(p 10); ADM=$(p 11)
fu() { echo "http://127.0.0.1:$1"; }                                   # a full URL (health probes; the monolith, which does not add a scheme)
u() { if [ -n "${BARE_URLS:-}" ]; then echo "127.0.0.1:$1"; else fu "$1"; fi; }   # BARE_URLS=1: hand services a bare host:port, as Render's fromService does

# start <label> <cwd> <entry> [VAR=value ...]  - runs with a clean environment: only what is listed + PATH.
start() {
  local label="$1" cwd="$2" entry="$3"; shift 3
  local extra=()
  if [ "$STACK_NODE_ENV" = production ]; then extra+=(NODE_ENV=production); fi
  ( cd "$cwd" && exec env -i PATH="$PATH" HOME="${HOME:-/tmp}" DOTENV_CONFIG_PATH=/dev/null \
      INTERNAL_JWT_SECRET="$INTERNAL_JWT_SECRET" ${extra[@]+"${extra[@]}"} "$@" "$NODE_BIN" "$entry" ) \
      >"$STACK_DIR/$label.log" 2>&1 &
  echo "$! $label" >>"$STACK_DIR/pids"
}

wait_ok() { # <label> <url>
  for _ in $(seq 1 120); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$2" 2>/dev/null)" = 200 ] && { echo "  up   $1 $2"; return 0; }
    sleep 1
  done
  echo "  DOWN $1 $2 - last log lines:"; tail -n 20 "$STACK_DIR/$1.log" || true
  return 1
}

cmd_start() {
  mkdir -p "$STACK_DIR"; : >"$STACK_DIR/pids"
  local prod=()
  if [ "$STACK_NODE_ENV" = production ]; then prod=(CORS_ORIGIN=https://dashboard.invalid); fi

  # The six services (identity's first start creates the first admin from ADMIN_PASSWORD), in dependency order (docs/MICROSERVICES_CUTOVER.md): leaf first, then who needs whom.
  start engagement "$BACKEND" services/engagement/src/server.js PORT="$ENG" MONGODB_URI="$MONGO_BASE" DB_NAME="${DB_PREFIX}engagement" IDENTITY_URL="$(u "$IDN")"
  start identity   "$BACKEND" services/identity/src/server.js   PORT="$IDN" MONGODB_URI="$MONGO_BASE" DB_NAME="${DB_PREFIX}identity" CALLS_URL="$(u "$CAL")" MONOLITH_URL="$(u "$MON")" ADMIN_USERNAME=admin ADMIN_PASSWORD="$ADMIN_PASSWORD" ${FIREBASE_SERVICE_ACCOUNT_PATH:+FIREBASE_SERVICE_ACCOUNT_PATH="$FIREBASE_SERVICE_ACCOUNT_PATH"}
  start catalog    "$BACKEND" services/catalog/src/server.js     PORT="$CAT" MONGODB_URI="$MONGO_BASE" DB_NAME="${DB_PREFIX}catalog" ENGAGEMENT_URL="$(u "$ENG")" ORDERS_URL="$(u "$ORD")" LIVE_PROBE=0 ${OVERPASS_URLS:+OVERPASS_URLS="$OVERPASS_URLS"}
  start wallet     "$BACKEND" services/wallet/src/server.js      PORT="$WAL" MONGODB_URI="$MONGO_BASE" DB_NAME="${DB_PREFIX}wallet" ENGAGEMENT_URL="$(u "$ENG")" IDENTITY_URL="$(u "$IDN")" ADMIN_SESSION_SECRET="$ADMIN_SESSION_SECRET"
  start orders     "$BACKEND" services/orders/src/server.js      PORT="$ORD" MONGODB_URI="$MONGO_BASE" DB_NAME="${DB_PREFIX}orders" WALLET_URL="$(u "$WAL")" CATALOG_URL="$(u "$CAT")" IDENTITY_URL="$(u "$IDN")" ENGAGEMENT_URL="$(u "$ENG")" ADMIN_SESSION_SECRET="$ADMIN_SESSION_SECRET"
  start events     "$BACKEND" services/events/src/server.js      PORT="$EVT" MONGODB_URI="$MONGO_BASE" DB_NAME="${DB_PREFIX}events" CATALOG_URL="$(u "$CAT")" WALLET_URL="$(u "$WAL")" IDENTITY_URL="$(u "$IDN")" ADMIN_SESSION_SECRET="$ADMIN_SESSION_SECRET"
  start calls      "$BACKEND" services/calls/src/server.js       PORT="$CAL" MONGODB_URI="$MONGO_BASE" DB_NAME="${DB_PREFIX}calls" WALLET_URL="$(u "$WAL")" IDENTITY_URL="$(u "$IDN")" ENGAGEMENT_URL="$(u "$ENG")" ADMIN_SESSION_SECRET="$ADMIN_SESSION_SECRET"

  local base="$MONGO_BASE"
  # The monolith: the shell. Every *_URL set = it serves only /api/health. Its own database is a throwaway.
  start monolith "$MONO" src/index.js PORT="$MON" MONGODB_URI="${base%/}/${DB_PREFIX}bhakti_shell" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_SESSION_SECRET="$ADMIN_SESSION_SECRET" \
      PAYMENTS_PROVIDER=mock RTC_PROVIDER=mock \
      ENGAGEMENT_URL="$(fu "$ENG")" IDENTITY_URL="$(fu "$IDN")" CATALOG_URL="$(fu "$CAT")" WALLET_URL="$(fu "$WAL")" ORDERS_URL="$(fu "$ORD")" CALLS_URL="$(fu "$CAL")"
  local bffenv=(MONOLITH_URL="$(u "$MON")" ENGAGEMENT_URL="$(u "$ENG")" IDENTITY_URL="$(u "$IDN")" CATALOG_URL="$(u "$CAT")" WALLET_URL="$(u "$WAL")" ORDERS_URL="$(u "$ORD")" CALLS_URL="$(u "$CAL")" EVENTS_URL="$(u "$EVT")" ADMIN_SESSION_SECRET="$ADMIN_SESSION_SECRET")
  start mobile-bff "$BACKEND" bff/mobile/src/server.js PORT="$MOB" FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" ${prod[@]+"${prod[@]}"} "${bffenv[@]}"
  start admin-bff  "$BACKEND" bff/admin/src/server.js  PORT="$ADM" APP_ENV="${APP_ENV:-local}" SESSION_SAMESITE="$([ "$STACK_NODE_ENV" = production ] && echo None || echo Strict)" ${prod[@]+"${prod[@]}"} "${bffenv[@]}"

  echo "waiting for the stack (logs in $STACK_DIR):"
  local rc=0
  for pair in "engagement $(fu "$ENG")/health" "identity $(fu "$IDN")/health" "catalog $(fu "$CAT")/health" "wallet $(fu "$WAL")/health" "orders $(fu "$ORD")/health" "calls $(fu "$CAL")/health" "events $(fu "$EVT")/health" \
              "monolith $(fu "$MON")/api/health" "mobile-bff $(fu "$MOB")/api/health" "admin-bff $(fu "$ADM")/api/health"; do
    wait_ok ${pair% *} ${pair#* } || rc=1
  done
  [ "$rc" = 0 ] && echo "stack is up: mobile-bff $(fu "$MOB")  admin-bff $(fu "$ADM")" || { cmd_stop; exit 1; }
}

cmd_status() {
  for pair in "engagement $(fu "$ENG")/health" "identity $(fu "$IDN")/health" "catalog $(fu "$CAT")/health" "wallet $(fu "$WAL")/health" "orders $(fu "$ORD")/health" "calls $(fu "$CAL")/health" "events $(fu "$EVT")/health" \
              "monolith $(fu "$MON")/api/health" "mobile-bff $(fu "$MOB")/api/health" "admin-bff $(fu "$ADM")/api/health"; do
    echo "  ${pair% *}: $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${pair#* }" 2>/dev/null || echo down)"
  done
}

cmd_stop() {
  [ -f "$STACK_DIR/pids" ] || return 0
  while read -r pid label; do kill "$pid" 2>/dev/null && echo "  stopped $label ($pid)" || true; done <"$STACK_DIR/pids"
  rm -f "$STACK_DIR/pids"
}

case "${1:-}" in
  start) cmd_start ;;
  status) cmd_status ;;
  stop) cmd_stop ;;
  *) echo "usage: tools/stack.sh start|status|stop" >&2; exit 2 ;;
esac
