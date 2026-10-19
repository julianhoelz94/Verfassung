#!/usr/bin/env python3
"""Real HTTP-01 validation with an isolated Pebble CA; never contacts Let's Encrypt."""
import json
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request

EDGE = sys.argv[1] if len(sys.argv) > 1 else 'constitution-atlas/edge-proxy:ci'
PEBBLE = 'ghcr.io/letsencrypt/pebble@sha256:ddf230642b1a584f519f32e347de1b05a6e4c1f6c35c1863b33effeab5f78199'
name = 'atlas-acme-' + str(int(time.time()))
network = name + '-network'
containers = []


def docker(*args, capture=False):
    return subprocess.run(['docker', *args], check=True, text=True, stdout=subprocess.PIPE if capture else subprocess.DEVNULL).stdout


def port(container, number):
    return docker('port', container, str(number), capture=True).strip().split(':')[-1]


def get(url, ca=None):
    with urllib.request.urlopen(url, context=ssl.create_default_context(cafile=ca), timeout=3) as response:
        return response.read()


try:
    docker('network', 'create', network)
    with tempfile.TemporaryDirectory(prefix='atlas-acme-') as directory:
        folder = Path(directory)
        seed = name + '-seed'
        containers.append(seed)
        docker('create', '--name', seed, PEBBLE)
        docker('cp', seed + ':/test', str(folder / 'test'))
        config = json.loads((folder / 'test/config/pebble-config.json').read_text())
        config['pebble']['httpPort'] = 80
        config['pebble']['tlsPort'] = 443
        (folder / 'pebble.json').write_text(json.dumps(config))
        ca = name + '-ca'
        containers.append(ca)
        docker('run', '-d', '--name', ca, '--network', network, '--network-alias', 'pebble', '-p', '127.0.0.1::15000', '-v', str(folder / 'pebble.json') + ':/test/sprint58.json:ro', '-e', 'PEBBLE_VA_NOSLEEP=1', '-e', 'PEBBLE_WFE_NONCEREJECT=0', PEBBLE, '-config', '/test/sprint58.json', '-strict=false')
        api_root = folder / 'test/certs/pebble.minica.pem'
        for _ in range(30):
            try:
                issued_root = get('https://localhost:' + port(ca, 15000) + '/roots/0', str(api_root))
                break
            except (OSError, ValueError):
                time.sleep(1)
        else:
            raise RuntimeError('Pebble did not start')
        (folder / 'trust.pem').write_bytes(api_root.read_bytes() + b'\n' + issued_root)

        def edge(label, failure=False):
            container = name + '-' + label
            containers.append(container)
            hostname = 'failure.example.test' if failure else 'success.example.test'
            # For failure, the hostname resolves to Pebble itself, which has no
            # challenge listener on port 80. Success resolves to the real edge.
            if failure:
                docker('network', 'connect', '--alias', hostname, network, seed)
                docker('start', seed)
            args = ['run', '-d', '--name', container, '--network', network, '-p', '127.0.0.1::80', '-p', '127.0.0.1::443', '-e', 'PROFILE=ci', '-e', 'TLS_MODE=managed-acme', '-e', 'PUBLIC_BASE_URL=https://' + hostname, '-e', 'ACME_TEST_DIRECTORY=https://pebble:14000/dir', '-e', 'SSL_CERT_FILE=/test/trust.pem', '-v', str(folder / 'trust.pem') + ':/test/trust.pem:ro']
            if not failure:
                args += ['--network-alias', hostname]
            docker(*args, EDGE)
            status_url = 'http://127.0.0.1:' + port(container, 80) + '/setup/transport/status'
            target = 'failed' if failure else 'ready'
            for _ in range(75):
                try:
                    state = json.loads(get(status_url))
                    if state['state'] == target:
                        if failure:
                            assert state['ready'] is False
                        else:
                            assert state['ready'] is True
                            result = subprocess.run(['curl', '-sf', '--noproxy', '*', '--cacert', str(folder / 'trust.pem'), '--connect-to', hostname + ':443:127.0.0.1:' + port(container, 443), 'https://' + hostname + '/setup/transport/status'], capture_output=True, text=True, check=True)
                            assert json.loads(result.stdout)['ready'] is True
                        return
                except (OSError, ValueError):
                    pass
                time.sleep(1)
            docker('logs', container)
            raise RuntimeError('Expected ACME state ' + target)

        edge('success')
        edge('failure', failure=True)
        print('ACME HTTP-01: real challenge issuance, verified TLS, and actionable validation failure: passed')
finally:
    for container in reversed(containers):
        subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
