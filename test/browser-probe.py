import http.client
import json
import threading
import time
import urllib.request
import http.server
import socketserver
import os

os.chdir(os.path.join(os.path.dirname(__file__), '..'))

def wd(method, path, body=None):
    conn = http.client.HTTPConnection('127.0.0.1', 4444, timeout=20)
    headers = {'Content-Type': 'application/json'}
    conn.request(method, path, json.dumps(body) if body is not None else None, headers)
    resp = conn.getresponse()
    data = resp.read().decode('utf-8')
    conn.close()
    try:
        parsed = json.loads(data)
    except Exception:
        parsed = data
    return resp.status, parsed

# Wait briefly for the driver.
last = None
for _ in range(20):
    try:
        status, data = wd('GET', '/status')
        if status == 200:
            break
    except Exception as error:
        last = error
    time.sleep(0.25)
else:
    raise SystemExit(f'Driver did not start: {last}')

status, data = wd('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'safari'}}})
print('session status', status)
print(json.dumps(data)[:800])
if status != 200:
    raise SystemExit(1)
session_id = data.get('value', {}).get('sessionId') or data.get('sessionId')
print('session id', session_id)

# Serve the app.
handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

status, data = wd('POST', f'/session/{session_id}/url', {'url': f'http://127.0.0.1:{port}/index.html'})
print('navigate status', status, str(data)[:300])
time.sleep(1)
status, data = wd('POST', f'/session/{session_id}/execute/sync', {'script': 'return {title: document.title, ready: document.readyState, app: !!document.getElementById("app")};', 'args': []})
print('execute status', status, json.dumps(data)[:500])

wd('DELETE', f'/session/{session_id}')
httpd.shutdown()
