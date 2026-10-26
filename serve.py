"""Static server for the Lyra world.

Locally:   python serve.py [port]        -> http://localhost:8123, never cached (edits show up)
Railway:   python serve.py               -> listens on 0.0.0.0:$PORT, assets cached for an hour
"""
import functools
import gzip
import http.server
import io
import os
import sys

ON_HOST = 'PORT' in os.environ                     # Railway (and most hosts) set PORT
PORT = int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8123))
HOST = '0.0.0.0' if ON_HOST else '127.0.0.1'


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                      '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
                      '.ktx2': 'image/ktx2', '.map': 'application/json'}
    # gzipped on the way out (and kept in memory): the bundle, the meshopt models, the transcoder
    GZIP = ('.js', '.json', '.map', '.glb', '.wasm', '.html', '.css')
    gz_cache = {}

    def send_head(self):
        # story/ (reference material) and build/ (tooling) aren't part of the site
        if self.path.split('?')[0].startswith(('/story', '/build')):
            self.send_error(404); return None
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if (path.endswith(self.GZIP) and os.path.isfile(path)
                and 'gzip' in self.headers.get('Accept-Encoding', '')):
            return self.send_gzipped(path)
        return super().send_head()

    def send_gzipped(self, path):
        mtime = os.path.getmtime(path)
        hit = self.gz_cache.get(path)
        if not hit or hit[0] != mtime:
            with open(path, 'rb') as f:
                hit = (mtime, gzip.compress(f.read(), 6))
            self.gz_cache[path] = hit
        body = hit[1]
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        return io.BytesIO(body)

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
