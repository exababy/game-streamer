#!/usr/bin/env bash
# Pivot a running game-streamer pod from one match to another without
# restarting cs2 / steam. Invoked by spectator/routes/switch-match.mjs
# AFTER the cs2 console has already received `disconnect; connect ...`.
#
# Required env (set by spec-server before spawn):
#   MATCH_ID         new match id (target)
#   MATCH_PASSWORD   raw match password for status-reporter auth
#   MODE             "live" | "tv"
#   OLD_MATCH_ID     previous match id (may be empty on first switch)
#   CONNECT_ADDR / CONNECT_PASSWORD   (for live mode)  OR
#   PLAYCAST_URL                      (for tv+playcast mode)
#
# All steps best-effort + idempotent. A failure mid-flow leaves the
# pod in a degraded-but-streaming state (cs2 already followed the
# console command) rather than dead.

set -uo pipefail
SCRIPT_TAG=switch-match

# shellcheck disable=SC1091
. "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../lib/common.sh"
# shellcheck disable=SC1091
. "$LIB_DIR/stream.sh"
# shellcheck disable=SC1091
. "$LIB_DIR/hud-manager.sh"
# shellcheck disable=SC1091
. "$LIB_DIR/status-reporter.sh"

: "${MATCH_ID:=}"
: "${MATCH_PASSWORD:=}"
: "${OLD_MATCH_ID:=}"
: "${MODE:=live}"

if [ -z "$MATCH_ID" ] || [ -z "$MATCH_PASSWORD" ]; then
  die "MATCH_ID and MATCH_PASSWORD are required"
fi

log "pivoting pod: ${OLD_MATCH_ID:-<none>} -> $MATCH_ID (mode=$MODE)"

# 1. Capture pivot. mediamtx publish streamid is keyed by match id, so
#    the *viewer* URL has to change too — done via the api-side update
#    of match_streams.link before we ran. stop_capture is cheap (kill
#    the gst pid), start_capture re-runs the same pipeline under the
#    new streamid. Brief sleep gives mediamtx time to release the old
#    publisher slot.
if [ -n "$OLD_MATCH_ID" ] && [ "$OLD_MATCH_ID" != "$MATCH_ID" ]; then
  log "stopping capture for old match $OLD_MATCH_ID"
  stop_capture "$OLD_MATCH_ID" || true
  sleep 1
fi

# Try to inherit the old match's capture args (fps, kbps, audio) so a
# switch doesn't silently change encoder settings; fall back to the
# pod's defaults if the args file is gone.
FPS="${FPS:-30}"
VIDEO_KBPS="${VIDEO_KBPS:-6000}"
AUDIO=1
if [ -n "$OLD_MATCH_ID" ]; then
  OLD_ARGS_FILE="${LOG_DIR}/capture-${OLD_MATCH_ID}.args"
  if [ -f "$OLD_ARGS_FILE" ]; then
    # File order: stream_id, fps, kbps, pointer, audio  (see stream.sh)
    { read -r _; read -r _fps; read -r _kbps; read -r _; read -r _audio; } \
      <"$OLD_ARGS_FILE" || true
    [ -n "${_fps:-}" ]   && FPS="$_fps"
    [ -n "${_kbps:-}" ]  && VIDEO_KBPS="$_kbps"
    [ -n "${_audio:-}" ] && AUDIO="$_audio"
  fi
fi

log "starting capture for $MATCH_ID (fps=$FPS kbps=$VIDEO_KBPS)"
if ! start_capture "$MATCH_ID" "$FPS" "$VIDEO_KBPS" false "$AUDIO"; then
  warn "start_capture failed for $MATCH_ID — pod will retry on next status tick"
fi

# 2. HUD reseed — best-effort. Players/teams change with the match so
#    the HUD overlay needs a fresh DB or it'll render the previous
#    match's logos. seed_hud_db talks to hud-manager's REST.
if hud_running; then
  log "reseeding HUD for $MATCH_ID"
  seed_hud_db "$MATCH_ID" || warn "seed_hud_db returned non-zero"
  # Force the overlay to reload against the freshly-seeded data.
  # Forward HUD_MODE as the variant so the reload keeps the right layout.
  curl -fsS -m 5 -X POST -o /dev/null \
       -H 'content-type: application/json' \
       --data "{\"variant\":\"${HUD_MODE:-horizontal}\"}" \
       "http://${HUD_HOST:-127.0.0.1}:${HUD_PORT:-1349}/api/overlay/start" \
    || warn "/api/overlay/start failed"
else
  warn "hud-manager not running — skipping HUD reseed"
fi

# 3. Status-reporter rebind. The daemon's loop captures url+auth at
#    start, so it can't be coaxed into reporting for a different
#    match — kill + relaunch with the new MATCH_ID/MATCH_PASSWORD
#    exported. The reporter writes status against the new match row
#    immediately on the next tick.
log "rebinding status-reporter to $MATCH_ID"
stop_status_reporter || true
# Clear the boot-epoch marker so timing stats reset for the new match.
rm -f "${LOG_DIR}/status.boot.epoch" "${LOG_DIR}/status.last" \
      "${LOG_DIR}/status.state" "${LOG_DIR}/status.ack" 2>/dev/null || true
export MATCH_ID MATCH_PASSWORD
start_status_reporter
# Immediately publish a live status so the api flips match_streams.is_live
# for the new match row instead of waiting for the next cs2-driven event.
report_status status=live "stream_url=${MEDIAMTX_SRT_BASE}?streamid=publish:${MATCH_ID}"

log "switch-match flow done"
