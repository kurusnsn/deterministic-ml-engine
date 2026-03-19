import http.client
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SESSION_ID = os.environ.get("PERF_SESSION_ID")
if not SESSION_ID:
    raise SystemExit("PERF_SESSION_ID is required")

UPSTREAM = os.environ.get("PERF_UPSTREAM", "https://gateway.staging.chessvector.com")
parsed = urllib.parse.urlsplit(UPSTREAM)
if parsed.scheme not in ("http", "https"):
    raise SystemExit(f"Unsupported upstream scheme: {parsed.scheme}")

upstream_host = parsed.hostname or ""
upstream_port = parsed.port or (443 if parsed.scheme == "https" else 80)
upstream_base = parsed.path.rstrip("/")
conn_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _proxy(self):
        target = urllib.parse.urlsplit(self.path)
        upstream_path = f"{upstream_base}{target.path}"
        if target.query:
            upstream_path = f"{upstream_path}?{target.query}"

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length else None

        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in {"host", "content-length", "accept-encoding", "connection"}
        }
        headers["x-session-id"] = SESSION_ID

        conn = conn_class(upstream_host, upstream_port, timeout=60)
        conn.request(self.command, upstream_path, body=body, headers=headers)
        resp = conn.getresponse()
        data = resp.read()
        conn.close()

        self.send_response(resp.status, resp.reason)
        for key, value in resp.getheaders():
            if key.lower() in {"transfer-encoding", "content-encoding", "connection", "keep-alive"}:
                continue
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = _proxy
    do_POST = _proxy
    do_PUT = _proxy
    do_PATCH = _proxy
    do_DELETE = _proxy
    do_OPTIONS = _proxy

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    host = os.environ.get("PERF_PROXY_HOST", "127.0.0.1")
    port = int(os.environ.get("PERF_PROXY_PORT", "18080"))
    server = ThreadingHTTPServer((host, port), ProxyHandler)
    print(f"perf proxy listening on http://{host}:{port} -> {UPSTREAM}")
    server.serve_forever()
