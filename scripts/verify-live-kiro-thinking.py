"""Four short quota-consuming Kiro smoke requests: 5.5 models at xhigh and max."""
import datetime
import json
import sqlite3
import time
import urllib.request

with open('/home/alecto/.pi/agent/models.json') as config_file:
    provider = json.load(config_file)['providers']['omni']
headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.get('apiKey', 'omniroute-public')}
base_url = provider['baseUrl'].rstrip('/')
db = sqlite3.connect('file:/home/alecto/.omniroute/storage.sqlite?mode=ro', uri=True)
results = []
for model in ['claude-opus-5.5', 'claude-sonnet-5.5']:
    for effort in ['xhigh', 'max']:
        started = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        requested_model = 'kiro/' + model
        payload = {'model': requested_model, 'reasoning_effort': effort, 'stream': False,
                   'messages': [{'role': 'user', 'content': 'Return exactly OK. Do not use tools.'}],
                   'max_tokens': 128000}
        request = urllib.request.Request(base_url + '/chat/completions', headers=headers, data=json.dumps(payload).encode())
        with urllib.request.urlopen(request, timeout=90) as response:
            status = response.status
            body = json.load(response)
        content = body.get('choices', [{}])[0].get('message', {}).get('content', '')
        assert 'OK' in content, json.dumps({'status': status, 'error': body.get('error'), 'model': requested_model, 'effort': effort})
        row = None
        for attempt in range(30):
            row = db.execute('''select id,status,model,provider,resilience_actions,error_summary
                                from call_logs where timestamp >= ? and requested_model = ?
                                order by timestamp desc limit 1''', (started, requested_model)).fetchone()
            if row is not None:
                break
            time.sleep(0.5)
        assert row is not None, 'No matching call log for ' + requested_model
        assert row[1] == 200 and row[2] == model and row[3] == 'kiro' and not row[5], row
        result = {'model': requested_model, 'requested': effort, 'status': status, 'response': 'OK',
                  'callLogId': row[0], 'resilienceActions': row[4], 'usage': body.get('usage')}
        results.append(result)
        # Kiro call logs do not populate effort columns; wire-field proof is the
        # separate translator diagnostic. Do not invent upstream-effort telemetry.
        print(json.dumps(result), flush=True)
print(json.dumps({'liveKiroThinking': 'verified', 'requests': len(results),
                  'effortWireProof': 'verify-local-kiro-thinking.mjs', 'results': results}))
