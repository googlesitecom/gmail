#!/usr/bin/env python3
"""Tiny static server for in-browser QA: serves source/out under /gmail
(mirrors the GitHub Pages layout) on :4173. Usage: python3 scripts/qa_server.py
"""
import http.server, os, socketserver, urllib.parse

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'source', 'out')
ROOT = os.path.abspath(ROOT)
PORT = 4173


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.urlparse(path).path
        if path.startswith('/gmail'):
            path = path[len('/gmail'):] or '/'
        else:
            # other paths also map into out/ (asset fallbacks)
            pass
        return os.path.join(ROOT, path.lstrip('/'))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):  # quiet
        pass


with socketserver.ThreadingTCPServer(('0.0.0.0', PORT), Handler) as httpd:
    print(f'QA server on http://localhost:{PORT}/gmail/ -> {ROOT}')
    httpd.serve_forever()
