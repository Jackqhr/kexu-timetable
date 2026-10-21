#!/usr/bin/env python3
"""
课序 · local file server.

Serves the static app and persists the timetable to:

    data/timetable.json

The previous version is kept in data/timetable.backup.json.

Only the Python standard library is required.
"""

from __future__ import annotations

import argparse
import atexit
import datetime
import http.client
import json
import os
import shutil
import signal
import sys
import tempfile
import threading
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_FILE = DATA_DIR / "timetable.json"
BACKUP_FILE = DATA_DIR / "timetable.backup.json"
PID_FILE = DATA_DIR / "server.pid"
PORT_FILE = DATA_DIR / "server.port"
MAX_BODY_BYTES = 12 * 1024 * 1024
DEFAULT_PORT = 8765


def json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


class KexuHandler(SimpleHTTPRequestHandler):
    server_version = "KexuLocal/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_json(self, status, payload):
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def local_request(self):
        host = (self.headers.get("Host") or "").split(":")[0].strip("[]").lower()
        return host in ("127.0.0.1", "localhost", "::1")

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/") and not self.local_request():
            self.send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "仅允许本机访问"})
            return
        if path == "/api/health":
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "mode": "file",
                    "path": "data/timetable.json",
                    "absolute": str(DATA_FILE),
                    "backup": "data/timetable.backup.json",
                    "demo": False,
                },
            )
            return
        if path == "/api/state":
            if not DATA_FILE.exists():
                self.send_response(HTTPStatus.NO_CONTENT)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            try:
                body = DATA_FILE.read_bytes()
                json.loads(body.decode("utf-8"))
            except Exception as exc:  # noqa: BLE001
                self.send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {
                        "ok": False,
                        "error": f"data/timetable.json 无法解析：{exc}",
                    },
                )
                return
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/data" or path.startswith("/data/"):
            self.send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "数据目录仅通过本地 API 访问"})
            return
        super().do_GET()

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path.startswith("/api/") or path == "/data" or path.startswith("/data/"):
            self.send_response(HTTPStatus.METHOD_NOT_ALLOWED)
            self.end_headers()
            return
        super().do_HEAD()

    def do_PUT(self):
        if not self.local_request():
            self.send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "仅允许本机访问"})
            return
        path = urlparse(self.path).path
        if path != "/api/state":
            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "接口不存在"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "请求内容为空"})
            return
        if length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"ok": False, "error": "数据超过 12 MB"})
            return
        body = self.rfile.read(length)
        try:
            parsed = json.loads(body.decode("utf-8"))
            if not isinstance(parsed, dict):
                raise ValueError("顶层必须是 JSON 对象")
        except Exception as exc:  # noqa: BLE001
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": f"无效的 JSON：{exc}"})
            return

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        temp_path = None
        try:
            if DATA_FILE.exists():
                shutil.copy2(DATA_FILE, BACKUP_FILE)
                try:
                    os.chmod(BACKUP_FILE, 0o644)
                except OSError:
                    pass
            written_at = datetime.datetime.now().astimezone()
            saved_at = written_at.isoformat(timespec="seconds")
            if not isinstance(parsed.get("meta"), dict):
                parsed["meta"] = {}
            parsed["meta"]["lastSavedAt"] = saved_at
            fd, temp_name = tempfile.mkstemp(prefix=".timetable-", suffix=".tmp", dir=DATA_DIR)
            temp_path = Path(temp_name)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(parsed, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, DATA_FILE)
            temp_path = None
            try:
                os.chmod(DATA_FILE, 0o644)
            except OSError:
                pass
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "path": "data/timetable.json",
                    "absolute": str(DATA_FILE),
                    "savedAt": saved_at,
                },
            )
        except Exception as exc:  # noqa: BLE001
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": f"写入失败：{exc}"})
        finally:
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass

    def log_message(self, fmt, *args):
        # Keep terminal output focused on startup and write events.
        if self.path.startswith("/api/state") and self.command == "PUT":
            print(f"  · 已写入 {DATA_FILE.name}")
            return
        if self.path.startswith("/api/"):
            return
        if self.command != "GET" or self.path not in ("/", "/index.html"):
            return
        super().log_message(fmt, *args)


def healthy_server_on(host: str, port: int):
    """Return True when a Kexu file server for this folder is listening on port."""
    expected = str(DATA_FILE.resolve())
    connection = http.client.HTTPConnection(host, port, timeout=0.35)
    try:
        connection.request("GET", "/api/health")
        response = connection.getresponse()
        if response.status != 200:
            return False
        payload = json.loads(response.read().decode("utf-8"))
        if not payload.get("ok") or payload.get("mode") != "file":
            return False
        absolute = payload.get("absolute")
        return bool(absolute) and str(Path(absolute).resolve()) == expected
    except Exception:  # noqa: BLE001
        return False
    finally:
        connection.close()


def write_server_info(port: int):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    PORT_FILE.write_text(str(port), encoding="utf-8")


def remove_server_info():
    try:
        if PID_FILE.exists() and PID_FILE.read_text(encoding="utf-8").strip() == str(os.getpid()):
            PID_FILE.unlink()
    except OSError:
        pass
    try:
        PORT_FILE.unlink()
    except OSError:
        pass


def pick_server(host: str, start_port: int):
    for port in range(start_port, start_port + 30):
        try:
            server = ThreadingHTTPServer((host, port), KexuHandler)
            server.daemon_threads = True
            return server, port
        except OSError:
            continue
    raise RuntimeError(f"无法在 {start_port}–{start_port + 29} 之间找到空闲端口")


def main():
    parser = argparse.ArgumentParser(description="课序本地文件服务器")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="起始端口，默认 8765")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认仅本机")
    parser.add_argument("--open", action="store_true", help="启动后自动打开浏览器")
    parser.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--new", action="store_true", help="忽略已运行的服务，强制启动新实例")
    args = parser.parse_args()

    if not args.new and PORT_FILE.exists():
        try:
            existing_port = int(PORT_FILE.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            existing_port = 0
        if existing_port and healthy_server_on(args.host, existing_port):
            url = f"http://{args.host}:{existing_port}/"
            print("")
            print("  课序服务已经在运行")
            print("  ─────────────────────────────")
            print(f"  浏览器： {url}")
            print(f"  课程数据： {DATA_FILE}")
            print("  直接打开已有服务即可；重复启动不会新开进程。")
            print("")
            if args.open and not args.no_open:
                webbrowser.open(url)
            return

    try:
        server, port = pick_server(args.host, args.port)
    except Exception as exc:  # noqa: BLE001
        print(f"启动失败：{exc}", file=sys.stderr)
        raise SystemExit(1)

    write_server_info(port)
    atexit.register(remove_server_info)

    def stop_on_signal(_signum, _frame):
        raise KeyboardInterrupt

    try:
        signal.signal(signal.SIGTERM, stop_on_signal)
        if hasattr(signal, "SIGHUP"):
            signal.signal(signal.SIGHUP, stop_on_signal)
    except (AttributeError, ValueError):
        pass

    url = f"http://{args.host}:{port}/"
    print("")
    print("  课序 · 本地文件模式")
    print("  ─────────────────────────────")
    print(f"  浏览器： {url}")
    print(f"  课程数据： {DATA_FILE}")
    print(f"  上一版备份： {BACKUP_FILE}")
    print("")
    print("  数据只写入本目录的 data/ 文件夹，不经过 cookie 或浏览器数据库。")
    print("  按 Ctrl+C 停止服务。")
    print("")

    if args.open and not args.no_open:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止本地文件服务。")
    finally:
        server.server_close()
        remove_server_info()


if __name__ == "__main__":
    main()
