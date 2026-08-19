"""静态文件服务 + PNG 回传接收器（同源，省掉 CORS）。

这台机器没有 Node，也没法用 preview_screenshot（renderer 没开
preserveDrawingBuffer，Browser 面板不显示时就报 "not compositing frames"）。
所以离屏渲染出来的 PNG 靠 POST /__capture 落盘，再用 Read 当图片看。

    python .claude/capture_server.py 8123

POST /__capture  body: {"name": "xxx.png", "png": "data:image/png;base64,..."}
落盘到 .claude/shots/xxx.png
"""
import base64
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, '.claude', 'shots')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 改完文件立刻要看到效果，不能让浏览器缓存旧的 game_v2.js
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_POST(self):
        if self.path.split('?')[0] != '/__capture':
            self.send_error(404, 'only /__capture')
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
            payload = json.loads(self.rfile.read(length).decode('utf-8', 'replace'))
            name = os.path.basename(payload.get('name') or 'shot')
            if not name.lower().endswith('.png'):
                name += '.png'
            url = payload['png']
            raw = base64.b64decode(url.split(',', 1)[1] if ',' in url else url)
            os.makedirs(SHOTS, exist_ok=True)
            path = os.path.join(SHOTS, name)
            with open(path, 'wb') as fh:
                fh.write(raw)
            body = json.dumps({'ok': True, 'path': path, 'bytes': len(raw)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001 - 调试服务器，报出来就行
            self.send_error(500, repr(exc))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print('serving %s on http://127.0.0.1:%d  (POST /__capture -> %s)'
          % (ROOT, port, SHOTS), flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
