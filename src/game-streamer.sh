#!/usr/bin/env bash
# game-streamer entrypoint. Three paths: live, demo, batch-highlights.

set -uo pipefail
SCRIPT_TAG=game-streamer

# shellcheck disable=SC1091
. "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib/common.sh"

load_env

usage() {
  cat <<EOF
usage: $(basename "$0") <command>

  live              setup Steam + launch CS2 + start match capture
  demo              setup Steam + download \$DEMO_URL + play it back + capture
  batch-highlights  demo flow with CLIP_BATCH_MODE=1 — renders \$CLIP_BATCH_JOBS
                    sequentially against the same cs2 instance, then exits
EOF
}

run_demo_flow() {
  mkdir -p /tmp/game-streamer
  if [ -n "${DEMO_URL:-}" ]; then
    DEMO_FILE_BG="${DEMO_FILE:-/tmp/game-streamer/demo.dem}"
    rm -f "$DEMO_FILE_BG" "$DEMO_FILE_BG.failed" "$DEMO_FILE_BG.partial"
    (
      # shellcheck disable=SC1091
      . "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib/common.sh"
      # shellcheck disable=SC1091
      . "$LIB_DIR/status-reporter.sh"
      SCRIPT_TAG=demo-download
      # Report HERE — without this the only `downloading_demo` event
      # comes from run-demo.sh after the file's already on disk, gets
      # coalesced by the 2s daemon poll, and the web stepper marks the
      # stage SKIPPED.
      report_status status=downloading_demo
      if curl --fail --silent --show-error --location \
              --retry 5 --retry-delay 2 --retry-all-errors \
              --max-time "${DEMO_DOWNLOAD_TIMEOUT:-300}" \
              --output "$DEMO_FILE_BG.partial" \
              "$DEMO_URL"; then
        mv -f "$DEMO_FILE_BG.partial" "$DEMO_FILE_BG"
      else
        touch "$DEMO_FILE_BG.failed"
      fi
    ) > >(awk '{print "[demo-download] " $0; fflush()}' >&2) 2>&1 &
    echo $! > /tmp/game-streamer/demo-download.pid
  fi
  if [ -n "${WORKSHOP_ID:-}" ]; then
    WORKSHOP_TARGET="${STEAM_LIBRARY:-/mnt/game-streamer}/steamapps/workshop/content/730/${WORKSHOP_ID}"
    WORKSHOP_FAILED="/tmp/game-streamer/workshop-${WORKSHOP_ID}.failed"
    CS2_MANIFEST="${STEAM_LIBRARY:-/mnt/game-streamer}/steamapps/appmanifest_730.acf"
    rm -f "$WORKSHOP_FAILED"
    (
      # shellcheck disable=SC1091
      . "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib/common.sh"
      # shellcheck disable=SC1091
      . "$LIB_DIR/steam.sh"
      # shellcheck disable=SC1091
      . "$LIB_DIR/status-reporter.sh"
      SCRIPT_TAG=workshop-bg
      # Two concurrent steamcmd processes fight over ~/.steam state, so
      # wait for the cs2 install to finish before starting our own.
      for _ in $(seq 1 600); do
        [ -f "$CS2_MANIFEST" ] && break
        sleep 2
      done
      if [ ! -f "$CS2_MANIFEST" ]; then
        warn "cs2 manifest never appeared — skipping workshop download"
        touch "$WORKSHOP_FAILED"
        exit 0
      fi
      report_status status=downloading_workshop_map "workshop_id=${WORKSHOP_ID}"
      if ! download_workshop_map "$WORKSHOP_ID"; then
        touch "$WORKSHOP_FAILED"
      fi
    ) > >(awk '{print "[workshop-download] " $0; fflush()}' >&2) 2>&1 &
    echo $! > /tmp/game-streamer/workshop-download.pid
  fi
  "$FLOWS_DIR/setup-steam.sh" "$@" || exit $?
  exec "$FLOWS_DIR/run-demo.sh" "$@"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  live)
    "$FLOWS_DIR/setup-steam.sh" "$@" || exit $?
    exec "$FLOWS_DIR/run-live.sh" "$@"
    ;;
  demo)
    run_demo_flow "$@"
    ;;
  batch-highlights)
    export CLIP_BATCH_MODE=1
    run_demo_flow "$@"
    ;;
  -h|--help|help|"") usage ;;
  *) echo "unknown command: $cmd" >&2; usage >&2; exit 2 ;;
esac
