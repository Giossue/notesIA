#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${PROJECT_DIR}/$(basename -- "${BASH_SOURCE[0]}")"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}"
SESSION_FILE="${RUNTIME_DIR}/notesia-local-${UID}.kitty-session"

export PATH="${HOME}/.bun/bin:${HOME}/Android/Sdk/platform-tools:${PATH}"
export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Android/Sdk}"

info() {
  printf '[NotesIA] %s\n' "$*"
}

fail() {
  printf '[NotesIA] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Uso:
  ./iniciar-notesia-local.sh           Abre todo NotesIA en una ventana de Kitty.
  ./iniciar-notesia-local.sh --check   Comprueba el entorno sin abrir Kitty.
  ./iniciar-notesia-local.sh --help    Muestra esta ayuda.

La ventana contiene pestañas para API, worker, admin, Metro y Android.
La pestaña Android espera un dispositivo USB autorizado, configura adb reverse,
compila de forma incremental e instala/abre la app.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "No se encontró '$1'. $2"
}

java_17_home() {
  local candidate version_line
  local -a candidates=(
    "${NOTESIA_JAVA_HOME:-}"
    "${JAVA_HOME:-}"
    "/usr/lib/jvm/java-17-openjdk"
    "/usr/lib/jvm/java-17-openjdk-amd64"
  )

  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" && -x "$candidate/bin/java" ]] || continue
    version_line="$("$candidate/bin/java" -version 2>&1 | head -n 1)"
    if [[ "$version_line" == *'version "17.'* || "$version_line" == *'version "17"'* ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

port_is_open() {
  ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
}

project_worker_is_running() {
  local pid cwd
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    cwd="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
    [[ "$cwd" == "$PROJECT_DIR" ]] && return 0
  done < <(pgrep -f '^bun --watch apps/worker/src/index\.ts$' 2>/dev/null || true)
  return 1
}

preflight() {
  require_command kitty "Instala Kitty antes de usar este lanzador."
  require_command bun "Instala Bun o comprueba ~/.bun/bin."
  require_command curl "Instala curl para comprobar API y Metro."
  require_command pg_isready "Instala el cliente de PostgreSQL."
  require_command adb "Instala Android platform-tools."
  require_command pgrep "Instala procps."
  require_command ss "Instala iproute2."

  [[ -f "$PROJECT_DIR/.env" ]] || fail "Falta $PROJECT_DIR/.env."
  [[ -d "$ANDROID_HOME" ]] || fail "No existe el Android SDK en $ANDROID_HOME."

  if [[ ! -x "$PROJECT_DIR/node_modules/.bin/react-native" || ! -x "$PROJECT_DIR/node_modules/.bin/vite" ]]; then
    info "Instalando dependencias que faltan..."
    (cd "$PROJECT_DIR" && bun install --frozen-lockfile)
  fi

  pg_isready -q -h 127.0.0.1 -p 5432 -d notesia_dev ||
    fail "PostgreSQL local no responde. Inícialo con: sudo systemctl start postgresql"

  local port
  for port in 3000 5173 8082; do
    port_is_open "$port" &&
      fail "El puerto $port ya está ocupado. Cierra la sesión local anterior de NotesIA."
  done
  project_worker_is_running &&
    fail "Ya existe un worker local de NotesIA. Cierra la sesión anterior."

  JAVA_HOME="$(java_17_home)" ||
    fail "No se encontró JDK 17. Instala OpenJDK 17 o define NOTESIA_JAVA_HOME."
  export JAVA_HOME

  info "Aplicando migraciones locales pendientes..."
  (cd "$PROJECT_DIR" && bun run db:migrate:local)
  info "Entorno local comprobado."
}

open_shell_after_exit() {
  local service_name="$1"
  local status="$2"
  local user_shell="${SHELL:-/bin/bash}"

  if ((status == 0)); then
    printf '\n[NotesIA] %s se detuvo.\n' "$service_name"
  else
    printf '\n[NotesIA] %s terminó con código %s.\n' "$service_name" "$status" >&2
  fi
  printf '[NotesIA] La terminal queda abierta para revisar el resultado.\n'

  [[ -x "$user_shell" ]] || user_shell=/bin/bash
  exec "$user_shell" -l
}

run_and_hold() {
  local service_name="$1"
  shift
  local status

  set +e
  "$@"
  status=$?
  set -e
  open_shell_after_exit "$service_name" "$status"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local max_seconds="${3:-180}"
  local elapsed=0

  info "Esperando $name..."
  while ((elapsed < max_seconds)); do
    if curl -fsS --max-time 1 "$url" >/dev/null 2>&1; then
      info "$name listo."
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done

  printf '[NotesIA] %s no respondió después de %s segundos.\n' "$name" "$max_seconds" >&2
  return 1
}

select_android_device() {
  local configured_serial="${ANDROID_SERIAL:-}"
  if [[ -n "$configured_serial" ]] &&
    adb -s "$configured_serial" get-state 2>/dev/null | grep -qx device; then
    printf '%s\n' "$configured_serial"
    return 0
  fi

  adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }'
}

run_android() {
  if ! wait_for_url "la API" "http://127.0.0.1:3000/v1/health"; then
    open_shell_after_exit "Android" 1
  fi
  if ! wait_for_url "Metro" "http://127.0.0.1:8082/status"; then
    open_shell_after_exit "Android" 1
  fi

  adb start-server >/dev/null
  info "Conecta y desbloquea el teléfono; acepta la autorización USB si aparece."

  local device_serial=""
  until [[ -n "$device_serial" ]]; do
    device_serial="$(select_android_device)"
    [[ -n "$device_serial" ]] || sleep 2
  done

  export ANDROID_SERIAL="$device_serial"
  info "Dispositivo Android listo: $device_serial"
  adb reverse tcp:3000 tcp:3000
  adb reverse tcp:8082 tcp:8082

  cd "$PROJECT_DIR/apps/mobile"
  run_and_hold "Android" bun run android
}

run_service() {
  local service="${1:-}"
  cd "$PROJECT_DIR"

  case "$service" in
    api)
      info "API: http://127.0.0.1:3000/v1"
      run_and_hold "API" bun run dev:api
      ;;
    worker)
      info "Worker de avisos, correo y procesos diferidos"
      run_and_hold "Worker" bun run dev:worker
      ;;
    admin)
      info "Admin: http://127.0.0.1:5173/login"
      run_and_hold "Admin" bun run dev:admin
      ;;
    metro)
      info "Metro: http://127.0.0.1:8082"
      run_and_hold "Metro" bun run dev:mobile
      ;;
    android)
      run_android
      ;;
    *)
      fail "Servicio interno desconocido: ${service:-vacío}"
      ;;
  esac
}

write_kitty_session() {
  local quoted_project quoted_script
  printf -v quoted_project '%q' "$PROJECT_DIR"
  printf -v quoted_script '%q' "$SCRIPT_PATH"

  umask 077
  cat >"$SESSION_FILE" <<EOF
os_window_title NotesIA local
layout stack
cd $quoted_project
launch --title API $quoted_script __service api

new_tab Worker
cd $quoted_project
launch --title Worker $quoted_script __service worker

new_tab Admin
cd $quoted_project
launch --title Admin $quoted_script __service admin

new_tab Metro
cd $quoted_project
launch --title Metro $quoted_script __service metro

new_tab Android
cd $quoted_project
launch --title Android $quoted_script __service android

focus_tab 4
EOF
}

launch_all() {
  preflight
  write_kitty_session
  kitty --detach --class notesia-local --name notesia-local --session "$SESSION_FILE"
  info "Kitty abierto con API, worker, admin, Metro y Android."
  info "Cierra la ventana 'NotesIA local' para detener la sesión."
}

case "${1:-}" in
  "")
    launch_all
    ;;
  --check)
    preflight
    write_kitty_session
    info "Sesión de Kitty preparada correctamente."
    ;;
  --help|-h)
    usage
    ;;
  __service)
    shift
    run_service "${1:-}"
    ;;
  *)
    usage >&2
    fail "Opción desconocida: $1"
    ;;
esac
