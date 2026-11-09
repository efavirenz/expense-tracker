import http.server
import socketserver
import threading
import urllib.request
import os

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

paths = ['/', '/index.html', '/manifest.json', '/css/style.css', '/js/store.js',
         '/js/app.js', '/js/sw-register.js', '/service-worker.js',
         '/icons/icon-192.png', '/icons/icon-512.png']
for path in paths:
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}') as response:
            print(f'{response.status} {path} ({response.headers.get("Content-Type")})')
    except Exception as error:
        print(f'ERROR {path}: {error}')
httpd.shutdown()
