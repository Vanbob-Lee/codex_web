#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEX_CMD="codex"
CODEX_HOST="127.0.0.1"
CODEX_PORT="4500"
WEB_PORT="8080"
CODEX_PID=""

cleanup() {
  if [[ -n "$CODEX_PID" ]] && kill -0 "$CODEX_PID" 2>/dev/null; then
    kill "$CODEX_PID"
    wait "$CODEX_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if ! command -v "$CODEX_CMD" >/dev/null 2>&1; then
  echo "未找到 ${CODEX_CMD} 命令，请先安装对应的 Codex CLI 或 fork 工具。" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "未找到 python3，无法启动静态文件服务。" >&2
  exit 1
fi

if ! lsof -nP -iTCP:"$CODEX_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "启动 App Server（${CODEX_CMD}）：ws://${CODEX_HOST}:${CODEX_PORT}"
  "$CODEX_CMD" app-server --listen "ws://${CODEX_HOST}:${CODEX_PORT}" >"${TMPDIR:-/tmp}/codex-web-app-server.log" 2>&1 &
  CODEX_PID="$!"

  for _ in {1..50}; do
    if curl -fsS --max-time 1 "http://${CODEX_HOST}:${CODEX_PORT}/readyz" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done

  if ! curl -fsS --max-time 1 "http://${CODEX_HOST}:${CODEX_PORT}/readyz" >/dev/null 2>&1; then
    echo "Codex App Server 未能就绪，日志：${TMPDIR:-/tmp}/codex-web-app-server.log" >&2
    exit 1
  fi
else
  echo "${CODEX_PORT} 端口已被占用，假设 App Server 由用户启动，继续启动 Web 服务。"
fi

echo "Web 服务：http://${CODEX_HOST}:${WEB_PORT}"
echo "按 Ctrl-C 停止服务。"
python3 "$ROOT_DIR/server.py" --host "$CODEX_HOST" --port "$WEB_PORT" --codex-host "$CODEX_HOST" --codex-port "$CODEX_PORT"
