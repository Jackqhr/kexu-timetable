#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PID_FILE="data/server.pid"
PORT_FILE="data/server.port"
if [[ ! -f "$PID_FILE" ]]; then
  echo "没有找到运行中的课序服务（data/server.pid 不存在）。"
  exit 0
fi
pid="$(tr -d '[:space:]' < "$PID_FILE")"
if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
  echo "PID 文件内容无效，已清理：$PID_FILE"
  rm -f "$PID_FILE" "$PORT_FILE"
  exit 1
fi
if ! kill -0 "$pid" 2>/dev/null; then
  echo "课序服务已不在运行，已清理 PID 文件。"
  rm -f "$PID_FILE" "$PORT_FILE"
  exit 0
fi
args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
if [[ "$args" != *"server.py"* ]]; then
  echo "PID $pid 不是课序服务，未停止。"
  exit 1
fi
kill "$pid" 2>/dev/null || true
for _ in {1..20}; do
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if kill -0 "$pid" 2>/dev/null; then
  echo "服务仍在退出中，请稍后再试。"
  exit 1
fi
rm -f "$PID_FILE" "$PORT_FILE"
echo "已停止课序本地文件服务。"
