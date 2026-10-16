#!/usr/bin/env bash
#
# A persistent TESTER deployment on one machine, published with ngrok. Free, and it keeps its data.
#
#   tools/tester.sh up        start mongod (persistent) + the whole stack + the ngrok tunnel
#   tools/tester.sh status    what is running, the public URL, and the health of the stack
#   tools/tester.sh url       print the public URL the app must be built with
#   tools/tester.sh down      stop the tunnel, the stack and mongod (data stays)
#   tools/tester.sh logs [x]  tail a service log (default: mobile-bff)
#
# Everything lives OUTSIDE the repo in $TESTER_HOME (default ~/.bhakti-tester): the mongod data, the generated secrets
# (mongod data, logs, pids; secrets live in backend/.env), the logs and pids. Nothing here touches Atlas, the throwaway test stacks, or your own Metro.
#
# Only the MOBILE BFF is published. The dashboard stays on your machine (see docs/TESTER_DEPLOY.md), so the admin API is never
# reachable from the internet. The stack runs in development mode: the mock payment and mock call providers are allowed, which is
# what lets testers "buy" coins without a real gateway - and also means anyone who learns the public URL could do the same, so
# treat the URL as semi-private and use throwaway data only.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$BACKEND/.." && pwd)"
TESTER_HOME="${TESTER_HOME:-$HOME/.bhakti-tester}"
SECRETS="${TESTER_ENV:-$BACKEND/.env}"            # gitignored (backend/.gitignore); override with TESTER_ENV
RUN="$TESTER_HOME/run"
MONGO_DIR="$TESTER_HOME/mongo"
MONGO_PORT="${TESTER_MONGO_PORT:-27500}"
BASE_PORT="${TESTER_BASE_PORT:-4600}"          # mobile BFF = BASE+10, admin BFF = BASE+11
MOBILE_PORT=$((BASE_PORT + 10))
ADMIN_PORT=$((BASE_PORT + 11))
export PATH="/opt/homebrew/bin:$PATH"          # Node >= 20.19.4 and mongod live here on this machine

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is not installed (or not on PATH)"; }

gen_secrets() {
  mkdir -p "$TESTER_HOME"
  if [ -f "$SECRETS" ]; then return; fi
  need openssl
  umask 077
  {
    echo "# Generated $(date -u +%FT%TZ) by tools/tester.sh. Keep private; backend/.env is gitignored, never commit it."
    echo "INTERNAL_JWT_SECRET=$(openssl rand -hex 24)"
    echo "ADMIN_SESSION_SECRET=$(openssl rand -hex 24)"
    echo "# The first dashboard admin is created from this on the FIRST start only (an empty operators collection)."
    echo "ADMIN_USERNAME=admin"
    echo "ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
    echo "# Your free ngrok static domain (ngrok dashboard -> Domains), without https://, e.g. my-name.ngrok-free.dev"
    echo "NGROK_DOMAIN="
    echo "# Firebase: the project of poojaappclone/google-services.json, and the service-account key (identity: push, block)."
    echo "FIREBASE_PROJECT_ID=pooja-app-aa462"
    echo "FIREBASE_SERVICE_ACCOUNT_PATH=\"$REPO/pooja-api/firebase-service-account.json\""
  } > "$SECRETS"
  chmod 600 "$SECRETS"
  say "created $SECRETS (mode 600). Read ADMIN_PASSWORD there; set NGROK_DOMAIN once you have claimed it."
}

load_secrets() {
  [ -f "$SECRETS" ] || die "no $SECRETS - run: tools/tester.sh up"
  set -a; . "$SECRETS"; set +a
}

mongo_running() { lsof -iTCP:"$MONGO_PORT" -sTCP:LISTEN >/dev/null 2>&1; }

start_mongo() {
  need mongod
  mkdir -p "$MONGO_DIR" "$RUN"
  if mongo_running; then say "  mongod already listening on :$MONGO_PORT"; return; fi
  mongod --dbpath "$MONGO_DIR" --port "$MONGO_PORT" --bind_ip 127.0.0.1 --fork --logpath "$RUN/mongod.log" >/dev/null
  for _ in $(seq 1 30); do mongo_running && break; sleep 0.5; done
  mongo_running || die "mongod did not start (see $RUN/mongod.log)"
  say "  mongod up on 127.0.0.1:$MONGO_PORT (data: $MONGO_DIR)"
}

stop_mongo() {
  mongo_running || { say "  mongod not running"; return; }
  # Only the instance THIS script started: it owns --dbpath $MONGO_DIR. Never touch anyone else's mongod.
  local pid
  pid="$(pgrep -f "mongod --dbpath $MONGO_DIR " | head -1 || true)"
  [ -n "$pid" ] || { say "  a mongod is on :$MONGO_PORT but it is not ours; leaving it"; return; }
  kill "$pid" && say "  mongod stopped (pid $pid)"
}

stack_cmd() {
  # An array, not a string: the repo path contains a space.
  local envs=(
    "MONGO_BASE=mongodb://127.0.0.1:$MONGO_PORT" "BASE_PORT=$BASE_PORT" "STACK_DIR=$RUN/stack" "DB_PREFIX="
    "ADMIN_PASSWORD=$ADMIN_PASSWORD" "INTERNAL_JWT_SECRET=$INTERNAL_JWT_SECRET" "ADMIN_SESSION_SECRET=$ADMIN_SESSION_SECRET"
    "FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
    "APP_ENV=tester" # the dashboard's environment badge
  )
  [ -n "${FIREBASE_SERVICE_ACCOUNT_PATH:-}" ] && [ -f "$FIREBASE_SERVICE_ACCOUNT_PATH" ] && envs+=("FIREBASE_SERVICE_ACCOUNT_PATH=$FIREBASE_SERVICE_ACCOUNT_PATH")
  # Optional: point the temples map at another Overpass-compatible server (a mirror, or a local stand-in while the public ones are down).
  [ -n "${OVERPASS_URLS:-}" ] && envs+=("OVERPASS_URLS=$OVERPASS_URLS")
  ( cd "$BACKEND" && env "${envs[@]}" tools/stack.sh "$@" )
}

ngrok_pid() { pgrep -f "ngrok http $MOBILE_PORT" | head -1 || true; }

start_ngrok() {
  need ngrok
  if [ -n "$(ngrok_pid)" ]; then say "  ngrok already running"; return; fi
  local args=(http "$MOBILE_PORT" --log=stdout --log-format=json)
  if [ -n "${NGROK_DOMAIN:-}" ]; then args+=(--url="https://$NGROK_DOMAIN"); else
    say "  NOTE: NGROK_DOMAIN is empty, so ngrok will give a RANDOM address that changes on every restart."
    say "        Claim your free static domain in the ngrok dashboard (Domains) and put it in $SECRETS."
  fi
  ( nohup ngrok "${args[@]}" > "$RUN/ngrok.log" 2>&1 & )
  for _ in $(seq 1 20); do public_url >/dev/null 2>&1 && break; sleep 0.5; done
}

public_url() {
  curl -s --max-time 3 http://127.0.0.1:4040/api/tunnels | python3 -c "
import sys, json
t = json.load(sys.stdin).get('tunnels', [])
u = next((x['public_url'] for x in t if x['public_url'].startswith('https://')), '')
print(u); sys.exit(0 if u else 1)"
}

cmd_up() {
  gen_secrets; load_secrets
  say "starting the tester deployment"
  start_mongo
  say "  starting the stack (first boot seeds the databases; takes ~20 s)"
  stack_cmd start | sed 's/^/  /'
  start_ngrok
  say ""
  cmd_status
}

cmd_status() {
  load_secrets
  say "mongod:      $(mongo_running && echo "up :$MONGO_PORT" || echo down)"
  say "mobile BFF:  $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$MOBILE_PORT/api/health" 2>/dev/null || true) (http://127.0.0.1:$MOBILE_PORT)"
  say "admin BFF:   $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$ADMIN_PORT/api/health" 2>/dev/null || true) (http://127.0.0.1:$ADMIN_PORT, local only)"
  local u; u="$(public_url 2>/dev/null || true)"
  say "public URL:  ${u:-none (ngrok is not running)}"
  [ -n "$u" ] && say "app build:   EXPO_PUBLIC_ADMIN_API=$u"
  if [ -n "${NGROK_DOMAIN:-}" ]; then say "static name: https://$NGROK_DOMAIN"; else say "static name: NOT SET (address changes on restart)"; fi
  [ -n "$u" ] && say "health deps: $(curl -s --max-time 5 "$u/health/deps" 2>/dev/null | head -c 160)"
  return 0
}

cmd_down() {
  say "stopping the tester deployment (data is kept)"
  local p; p="$(ngrok_pid)"; [ -n "$p" ] && { kill "$p" && say "  ngrok stopped"; } || say "  ngrok not running"
  [ -f "$SECRETS" ] && { load_secrets; stack_cmd stop | sed 's/^/  /' || true; }
  stop_mongo
}

case "${1:-}" in
  up) cmd_up ;;
  status) cmd_status ;;
  url) load_secrets; public_url || die "ngrok is not running" ;;
  down) cmd_down ;;
  logs) tail -n 60 -f "$RUN/stack/${2:-mobile-bff}.log" ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
