#!/usr/bin/env python3
"""Validate generated Caddy configs using the actual deployment image."""
import os
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
        subprocess.run(['docker', 'run', '--rm', '--entrypoint', 'caddy', '-e', 'ATLAS_CANONICAL_HOST=localhost', '-v', f'{source}:/etc/caddy/Caddyfile:ro', '-v', f'{config}:/etc/caddy/test.Caddyfile:ro', image, 'adapt', '--config', '/etc/caddy/test.Caddyfile', '--adapter', 'caddyfile'], stdout=subprocess.DEVNULL, check=True)
        print(f'{mode}: valid', flush=True)
