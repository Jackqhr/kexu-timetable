#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "需要 Python 3 才能启动本地文件存储。"
  echo "macOS 可通过 Homebrew 安装：brew install python"
  exit 1
fi
exec python3 server.py --open "$@"
