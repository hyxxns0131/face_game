"""포커페이스 챌린지 로컬 서버

실행:  python server.py        (기본 포트 8000)
       python server.py 9000   (포트 바꾸기)

윈도우에서 .js/.mjs/.wasm 파일 형식이 잘못 전달되는 문제를 막기 위해
파일 형식을 직접 지정하는 간단한 서버입니다.
"""
import http.server
import os
import sys
import threading
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
        ".json": "application/json",
        ".md": "text/plain; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 콘솔 조용히


if __name__ == "__main__":
    url = f"http://localhost:{PORT}"
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"\n  [포커페이스 챌린지] 실행 중:  {url}")
    print("  (끄려면 이 창에서 Ctrl + C)\n")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  서버를 종료했어요.")
