#!/usr/bin/env python3
"""Exercise actual local certificate issuance, trust, redirects and persistence."""
import json
import subprocess
import tempfile
import time
from pathlib import Path

image = 'constitution-atlas/edge-proxy:ci'
import sys
if len(sys.argv) > 1:
    image = sys.argv[1]
name = 'atlas-local-tls-test-' + str(int(time.time()))
volume = name + '-data'


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


try:
    run('docker', 'run', '-d', '--name', name, '-p', '127.0.0.1::80', '-p', '127.0.0.1::443', '-v', volume + ':/data', '-e', 'TLS_MODE=local-https', '-e', 'PROFILE=ci', '-e', 'PUBLIC_BASE_URL=https://localhost', image, stdout=subprocess.DEVNULL)
    http_port = run('docker', 'port', name, '80', capture_output=True).stdout.strip().split(':')[-1]
    https_port = run('docker', 'port', name, '443', capture_output=True).stdout.strip().split(':')[-1]
    status_url = 'http://127.0.0.1:' + http_port + '/setup/transport/status'
    for _ in range(45):
        attempt = subprocess.run(['curl', '-sS', '--max-time', '2', status_url], text=True, capture_output=True)
        if attempt.returncode == 0 and json.loads(attempt.stdout).get('ready'):
            break
        time.sleep(1)
    else:
        run('docker', 'logs', name)
        raise RuntimeError('Local HTTPS did not become ready')
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory) / 'root.crt'
        run('docker', 'cp', name + ':/data/caddy/pki/authorities/local/root.crt', str(root))
        ca_before = root.read_bytes()
        # No insecure flag: hostname and CA chain are checked by curl.
        response = run('curl', '-sf', '--cacert', str(root), 'https://localhost:' + https_port + '/setup/transport/status', capture_output=True)
        assert json.loads(response.stdout)['ready'] is True
        redirect = run('curl', '-sS', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', 'http://127.0.0.1:' + http_port + '/login', capture_output=True).stdout
        assert redirect.startswith('303 https://localhost/login'), redirect
        rejected = run('curl', '-sS', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', 'http://127.0.0.1:' + http_port + '/api/identity/login', capture_output=True).stdout
        assert rejected == '426', rejected
        run('docker', 'restart', name, stdout=subprocess.DEVNULL)
        time.sleep(1)
        https_port = run('docker', 'port', name, '443', capture_output=True).stdout.strip().split(':')[-1]
        run('docker', 'cp', name + ':/data/caddy/pki/authorities/local/root.crt', str(root))
        assert root.read_bytes() == ca_before
        for _ in range(30):
            attempt = subprocess.run(['curl', '-sf', '--cacert', str(root), 'https://localhost:' + https_port + '/setup/transport/status'], stdout=subprocess.DEVNULL)
            if attempt.returncode == 0:
                break
            time.sleep(1)
        else:
            run('docker', 'logs', name)
            raise RuntimeError('HTTPS did not recover after restart')
    print('Local HTTPS: trusted certificate, HTTP redirect, rejected HTTP credentials, persistent CA: passed')
finally:
    subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL)
    subprocess.run(['docker', 'volume', 'rm', volume], stdout=subprocess.DEVNULL)
