#!/usr/bin/env python3
"""Dev-only static server for the portfolio. Identical to

    python3 -m http.server 5500

except that every response carries `Cache-Control: no-store`.

Why this exists: the stdlib server sends no caching directive at all, only
`Last-Modified`. With no directive, Chrome picks its own freshness window
(a fraction of the file's age) and serves from disk *without asking us*.
None of the ~25 stylesheets in index.html carry a cache-busting query
string, so a warm profile can hold a mix of old and new files and render
the site with the newest material rules silently missing -- flat tiles,
no backdrop blur -- while incognito, with an empty cache, looks correct.

To rip this out: delete this file and set the "Start Frontend" task in
.vscode/tasks.json back to `python3 -m http.server 5500`.

Usage: python3 devserver.py [port]     (port defaults to 5500)
"""

import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # no-store rather than no-cache: no-cache still lets the browser keep
        # the copy and revalidate, which leaves room for a stale 304 chain.
        # In dev we want the bytes on the wire every single time.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


class DualStackServer(ThreadingHTTPServer):
    # The browser here is pointed at [::]:5500, so the socket has to answer on
    # IPv6. V6ONLY off means the one socket also serves 127.0.0.1 and
    # localhost, matching what `python3 -m http.server` did before.
    address_family = socket.AF_INET6
    daemon_threads = True

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    server = DualStackServer(("", port), NoStoreHandler)
    # "Serving HTTP" is the endsPattern the VS Code background task watches
    # for; keep that substring if you reword this line.
    print(f"Serving HTTP on port {port} (no-store) ...", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
        server.server_close()


if __name__ == "__main__":
    main()
