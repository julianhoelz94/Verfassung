#!/usr/bin/env python3
"""Validate generated Caddy configs using the actual deployment image."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/caddy'))
import transport

image = sys.argv[1] if len(sys.argv) > 1 else 'constitution-atlas/edge-proxy:ci'
source = Path(__file__).resolve().parents[1] / 'infra/caddy/Caddyfile'
with tempfile.TemporaryDirectory(prefix='atlas-transport-') as directory:
    for mode in sorted(transport.MODES):
        env = dict(PROFILE='local-stack', TLS_MODE=mode, PUBLIC_BASE_URL='http://localhost' if mode == 'local-http' else 'https://localhost', TLS_TRUSTED_PROXIES='172.22.0.3/32')
        config = Path(directory) / (mode + '.Caddyfile')
        config.write_text(transport.render(env))
        result = subprocess.run(['docker', 'run', '--rm', '--entrypoint', 'caddy', '-e', 'ATLAS_CANONICAL_HOST=localhost', '-v', f'{source}:/etc/caddy/Caddyfile:ro', '-v', f'{config}:/etc/caddy/test.Caddyfile:ro', image, 'adapt', '--config', '/etc/caddy/test.Caddyfile', '--adapter', 'caddyfile'], stdout=subprocess.PIPE, text=True, check=True)
        if mode == 'external-proxy':
            servers = json.loads(result.stdout)['apps']['http']['servers'].values()
            server = next(server for server in servers if ':80' in server['listen'])
            routes = server['routes'][0]['handle'][0]['routes']
            codes = [route['handle'][0].get('status_code') for route in routes[:2]]
            assert codes == [403, 426], 'Proxy guards must execute before status, authentication or page routes'
            assert '127.0.0.1:8081' in json.dumps(routes), 'Proxy login requires transport readiness'
        print(f'{mode}: valid', flush=True)
