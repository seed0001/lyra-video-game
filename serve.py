"""Static server for the Lyra world.

Locally:   python serve.py [port]        -> http://localhost:8123, never cached (edits show up)
Railway:   python serve.py               -> listens on 0.0.0.0:$PORT, assets cached for an hour
"""
import functools
import http.server
import os
import sys

ON_HOST = 'PORT' in os.environ                     # Railway (and most hosts) set PORT
PORT = int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8123))
HOST = '0.0.0.0' if ON_HOST else '127.0.0.1'


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                      '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm'}

    def send_head(self):
        # story/ is reference material for building the game, not part of the site
        if self.path.split('?')[0].startswith('/story'):
            self.send_error(404); return None
        return super().send_head()

    def end_headers(self):
        if ON_HOST and self.path.startswith('/assets/'):
            self.send_header('Cache-Control', 'public, max-age=3600')
        else:
            self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        if not ON_HOST: super().log_message(fmt, *args)


if __name__ == '__main__':
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)
    with http.server.ThreadingHTTPServer((HOST, PORT), handler) as httpd:
        print(f'Lyra world at http://{"localhost" if not ON_HOST else HOST}:{PORT}', flush=True)
        httpd.serve_forever()
