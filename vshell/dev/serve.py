# -*- coding: utf-8 -*-
"""Range 支持的静态服务器（dev harness 用；dash.js SegmentBase 需要 Range）"""
import http.server
import os
import re
import socketserver
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8932


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_POST(self):
        """诊断回传：/__diag → 追加到输出目录 _vs-diag.log"""
        if self.path.startswith("/__diag"):
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length).decode("utf-8", "replace")
            try:
                with open(os.path.join(ROOT, "_vs-diag.log"), "a", encoding="utf-8") as f:
                    f.write(body + "\n")
            except OSError:
                pass
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] %s %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if rng and os.path.isfile(path):
            size = os.path.getsize(path)
            m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
            if not m:
                return self.send_error(416, "Invalid Range")
            start_s, end_s = m.group(1), m.group(2)
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else size - 1
            if start >= size:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.end_headers()
                return
            end = min(end, size - 1)
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            sys.stderr.write("[serve] RANGE %s bytes=%d-%d/%d\n" % (self.path, start, end, size))
            with open(path, "rb") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            return
        super().do_GET()


if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("serving %s on http://127.0.0.1:%d" % (ROOT, PORT))
        httpd.serve_forever()
