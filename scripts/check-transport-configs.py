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

def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)

def matches_path(node, path):
    return any(
        isinstance(match, dict) and path in match.get('path', [])
        for match in node.get('match', [])
    )


def upstream_proxies(value, address):
    return [
        node for node in objects(value)
        if node.get('handler') == 'reverse_proxy'
        and any(upstream.get('dial') == address for upstream in node.get('upstreams', []))
    ]


def assert_pinned_peer(proxy, label):
    headers = proxy.get('headers', {}).get('request', {})
    replaced = {name.lower(): value for name, value in headers.get('set', {}).items()}
    appended = {name.lower() for name in headers.get('add', {})}
    for name in ('x-atlas-client-ip', 'x-forwarded-for'):
        assert replaced.get(name) == ['{http.vars.client_ip}'] and name not in appended, f'{label} must replace attacker-supplied {name}'


with tempfile.TemporaryDirectory(prefix='atlas-transport-') as directory:
    for mode in sorted(transport.MODES):
        env = dict(PROFILE='local-stack', TLS_MODE=mode, PUBLIC_BASE_URL='http://localhost' if mode == 'local-http' else 'https://localhost', TLS_TRUSTED_PROXIES='172.22.0.3/32')
        config = Path(directory) / (mode + '.Caddyfile')
        config.write_text(transport.render(env))
        result = subprocess.run(['docker', 'run', '--rm', '--entrypoint', 'caddy', '-e', 'ATLAS_CANONICAL_HOST=localhost', '-v', f'{source}:/etc/caddy/Caddyfile:ro', '-v', f'{config}:/etc/caddy/test.Caddyfile:ro', image, 'adapt', '--config', '/etc/caddy/test.Caddyfile', '--adapter', 'caddyfile'], stdout=subprocess.PIPE, text=True, check=True)
        adapted = json.loads(result.stdout)
        for path in ('/oauth/register*', '/api/identity*', '/api/docs/identity*'):
            routes = [node for node in objects(adapted) if matches_path(node, path)]
            proxies = [
                proxy for route in routes
                for proxy in upstream_proxies(route.get('handle', []), 'identity-service:8080')
            ]
            assert proxies, f'{path} must reach Identity through a trusted proxy'
            for proxy in proxies:
                assert_pinned_peer(proxy, path)
        docs_gates = [
            route for route in objects(adapted)
            if matches_path(route, '/api/docs/*')
            and upstream_proxies(route.get('handle', []), 'gateway-web:3000')
        ]
        assert docs_gates, 'Swagger API aliases must use the shared edge admission policy'
        for route in docs_gates:
            for proxy in upstream_proxies(route.get('handle', []), 'gateway-web:3000'):
                headers = proxy.get('headers', {}).get('request', {}).get('set', {})
                assert headers.get('X-Atlas-Original-Method') == ['{http.request.method}'], 'Docs admission must receive the real original method'
        gateways = upstream_proxies(adapted, 'gateway-web:3000')
        assert gateways, 'Public requests must reach the gateway through a trusted proxy'
        for proxy in gateways:
            assert_pinned_peer(proxy, 'Gateway')
        if mode == 'external-proxy':
            servers = adapted['apps']['http']['servers'].values()
            server = next(server for server in servers if ':80' in server['listen'])
            routes = server['routes'][0]['handle'][0]['routes']
            codes = [route['handle'][0].get('status_code') for route in routes[:2]]
            assert codes == [403, 426], 'Proxy guards must execute before status, authentication or page routes'
            assert '127.0.0.1:8081' in json.dumps(routes), 'Proxy login requires transport readiness'
        print(f'{mode}: valid', flush=True)
