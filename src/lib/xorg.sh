# shellcheck shell=bash
# Xorg + openbox bringup. Idempotent.

# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

xorg_running() {
  pgrep -x Xorg >/dev/null 2>&1 && xdpyinfo -display "$DISPLAY" >/dev/null 2>&1
}

start_xorg() {
  if xorg_running; then
    log "xorg already up on $DISPLAY"
  else
    log "starting Xorg on $DISPLAY"
    local n="${DISPLAY#:}"
    rm -f "/tmp/.X${n}-lock" "/tmp/.X11-unix/X${n}" 2>/dev/null || true
    # Xorg.wrap (setuid) refuses absolute paths for -config — must be
    # a bare filename in Xorg's search path.
    local cmd=(Xorg "$DISPLAY" -config "$XORG_CONFIG" -noreset
               -nolisten tcp -listen unix vt7)
    spawn_logged xorg "${cmd[@]}"
    local xpid=$SPAWNED_PID
    for _ in $(seq 1 20); do
      xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
      if ! kill -0 "$xpid" 2>/dev/null; then
        die "Xorg failed to start"
      fi
      sleep 0.5
    done
    xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 \
      || die "Xorg never accepted clients on $DISPLAY"
  fi

  if ! pgrep -x openbox >/dev/null 2>&1; then
    spawn_logged openbox openbox
    sleep 1
    pgrep -x openbox >/dev/null 2>&1 || warn "openbox didn't start"
  fi

  # Open X access so processes spawned outside our pgid can connect.
  xhost +local:           >/dev/null 2>&1 || true
  xhost +SI:localuser:root >/dev/null 2>&1 || true
}

stop_xorg() {
  pkill -x openbox 2>/dev/null || true
  pkill -x Xorg    2>/dev/null || true
}

list_x_windows() {
  if ! xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    log "  (no display on $DISPLAY)"
    return
  fi
  local count=0
  while IFS= read -r line; do
    log "  $line"
    count=$((count + 1))
  done < <(
    xwininfo -display "$DISPLAY" -root -tree 2>/dev/null \
      | awk '/"[^"]+"/{ for (i=1;i<=NF;i++) if ($i ~ /"[^"]+"/) { print; break } }' \
      | head -25
  )
  [ "$count" = 0 ] && log "  (no named windows)"
}

# Find the main Steam UI window — largest "Steam"-named window at
# least 500x300. The real client is a child window deep in the X tree;
# xdotool's getwindowgeometry doesn't reliably handle that case.
find_main_steam_window() {
  xwininfo -display "$DISPLAY" -root -tree 2>/dev/null | awk '
    /"Steam":/ {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^[0-9]+x[0-9]+\+/) {
          split($i, dim, "x")
          w = dim[1]
          sub(/\+.*/, "", dim[2])
          h = dim[2]
          if (w >= 500 && h >= 300) {
            area = w * h
            if (area > best) { best = area; best_id = $1 }
          }
          break
        }
      }
    }
    END { if (best_id != "") print best_id }
  '
}

# The pipe comes up before the UI does, and -applaunch issued before
# UI render sometimes hangs. Waits indefinitely; the api cancels by
# deleting the pod.
wait_for_main_steam_window() {
  log "waiting for the main Steam window"
  local i=0 id
  while :; do
    id=$(find_main_steam_window)
    if [ -n "$id" ]; then
      log "  ready after ${i}s: $id"
      return 0
    fi
    i=$(( i + 1 ))
    if [ $(( i % 15 )) -eq 0 ]; then
      log "  still waiting (${i}s)"
      list_x_windows
    fi
    sleep 1
  done
}

# Missed clicks on shader-skip / cloud-out-of-date dialogs were falling
# through and hitting Steam UI buttons (cancelling the launch, opening
# unrelated panels). Once cs2 is up, hide Steam.
minimize_steam_windows() {
  local main_id friends_id id
  main_id=$(find_main_steam_window)
  friends_id=$(xdotool search --name '^Friends List$' 2>/dev/null | head -1)
  for id in $main_id $friends_id; do
    [ -z "$id" ] && continue
    xdotool windowminimize "$id"            2>/dev/null || true
    wmctrl -ir "$id" -b add,hidden          2>/dev/null || true
    xdotool windowunmap   "$id"             2>/dev/null || true
    xdotool windowmove    "$id" -3000 -3000 2>/dev/null || true
  done
}

# Space activates the default-focused button on Steam's CEF modal
# dialogs (Cloud Out of Date, shader pre-cache, etc).
poke_steam_dialog() {
  local id
  id=$(find_main_steam_window)
  [ -z "$id" ] && return 0
  wmctrl -ia "$id" 2>/dev/null || true
  xdotool windowactivate --sync "$id" 2>/dev/null || true
  sleep 0.1
  xdotool key --clearmodifiers space 2>/dev/null || true
}
