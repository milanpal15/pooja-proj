#!/usr/bin/env bash
#
# Fire one Render deploy hook and explain whatever comes back.
#
#   scripts/render-deploy-hook.sh "<label>" "<hook url>"
#
# Shared by both services in the blueprint. A deploy hook failing is
# ordinary — suspended free instance, rotated key, wrong URL pasted — and
# each of those needs a different fix, so the exit message names which one
# it was rather than leaving a bare `curl: (22) 404` in the log.
set -euo pipefail

LABEL=${1:?usage: render-deploy-hook.sh <label> <hook-url>}
HOOK=${2:-}

if [ -z "$HOOK" ]; then
  echo "::error::No deploy hook set for $LABEL. See docs/DEPLOY.md."
  exit 1
fi

# Checked before calling, because the usual mistake is pasting the service
# URL instead of the hook from Settings → Deploy Hook, and that fails in a
# way that says nothing about what to fix.
case "$HOOK" in
  https://api.render.com/deploy/srv-*) ;;
  *)
    echo "::error::The deploy hook for $LABEL does not look like a Render deploy hook."
    echo "Expected: https://api.render.com/deploy/srv-XXXXXXXX?key=YYYYYYYY"
    echo "Got a value starting: $(printf '%.30s' "$HOOK")…"
    echo "Copy it from Render → $LABEL → Settings → Deploy Hook."
    exit 1
    ;;
esac

CODE=$(curl -sS -o /tmp/hook-"$LABEL".out -w '%{http_code}' -X POST "$HOOK")
echo "$LABEL: deploy hook responded $CODE"
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  exit 0
fi

# Each of these means something different, and the difference is the whole
# value of reading the log.
case "$CODE" in
  404) echo "::error::$LABEL: 404 — the service id or key in the hook URL is wrong. Re-copy it from Render → Settings → Deploy Hook." ;;
  409) echo "::error::$LABEL: 409 — Render is refusing to deploy this service. Usually it is suspended: free instance hours exhausted for the month, or suspended manually. Open the service in Render; the banner says which. The running instance keeps serving the OLD commit meanwhile." ;;
  401|403) echo "::error::$LABEL: $CODE — the key in the hook URL is no longer valid. Regenerate the Deploy Hook in Render and re-set the secret." ;;
  *) echo "::error::$LABEL: deploy hook returned $CODE." ;;
esac
cat /tmp/hook-"$LABEL".out
exit 1
