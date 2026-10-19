"""Serve the explorer locally: python3 serve.py [port]  (default 8000), then open http://localhost:PORT

A plain static server with caching disabled, so edits to the source show up on reload.
The .gz geometry is served as-is; the app decompresses it in the browser.
"""
import functools
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".gz": "application/octet-stream"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).resolve().parent))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Ultrasound Window Explorer: http://localhost:{port}")
        httpd.serve_forever()
