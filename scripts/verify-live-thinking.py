"""One bounded Codex max smoke request through the local OmniRoute server."""
import datetime
import json
import sqlite3
import sys
import time
import urllib.request

with open('/home/alecto/.pi/agent/models.json') as config_file:
    provider = json.load(config_file)['providers']['omni']
model = sys.argv[1] if len(sys.argv) > 1 else 'codex/gpt-6.1-sol'
started = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.get('apiKey', 'omniroute-public')}
base_url = provider['baseUrl'].rstrip('/')
with urllib.request.urlopen(urllib.request.Request(base_url + '/models?configuredOnly=true&prefix=canonical', headers=headers), timeout=15) as response:
    catalog = json.load(response)
assert any(m.get('id') == model for m in catalog['data'])
payload = {'model': model, 'reasoning_effort': 'max', 'stream': False,
           'messages': [{'role': 'user', 'content': 'Return exactly OK. Do not use tools.'}], 'max_tokens': 32}
request = urllib.request.Request(base_url + '/chat/completions', headers=headers, data=json.dumps(payload).encode())
with urllib.request.urlopen(request, timeout=90) as response:
    status = response.status
    body = json.load(response)
content = body.get('choices', [{}])[0].get('message', {}).get('content', '')
assert 'OK' in content, json.dumps({'status': status, 'error': body.get('error'), 'content': content})
db = sqlite3.connect('file:/home/alecto/.omniroute/storage.sqlite?mode=ro', uri=True)
row = None
for attempt in range(30):
    row = db.execute('''select status, requested_model, reasoning_effort_requested, reasoning_effort_upstream
                        from call_logs where timestamp >= ? and requested_model = ? order by timestamp desc limit 1''',
                     (started, model)).fetchone()
    if row is not None:
        break
    time.sleep(0.5)
assert row is not None, 'No matching call-log evidence for this smoke request'
assert row[0] == 200 and row[2:] == ('max', 'max'), row
print(json.dumps({'liveThinking': 'verified', 'status': status, 'model': row[1],
                  'requested': row[2], 'upstream': row[3], 'response': 'OK', 'usage': body.get('usage')}))
