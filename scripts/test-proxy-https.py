#!/usr/bin/env python3
"""Exercise trusted-proxy guards and verified public HTTPS before login.

Uses an isolated Docker network and a disposable Caddy internal CA. No public
domain, host trust changes, real credentials, or existing stack are required.
"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

IMAGE = sys.argv[1] if len(sys.argv) > 1 else 'constitution-atlas/edge-proxy:ci'
NAME = 'atlas-proxy-test-' + uuid.uuid4().hex[:10]
NETWORK = NAME + '-network'
HOST = 'proxy.example.test'
CONTAINERS = []


def docker(*args, capture=False):
    result = subprocess.run(['docker', *args], check=True, text=True, capture_output=capture,
                            stdout=None if capture else subprocess.DEVNULL)
    return result.stdout.strip() if capture else ''


def port(container, number):
    return docker('port', container, str(number), capture=True).split(':')[-1]


def request(url, ca=None, target_port=None, headers=(), data=None):
    args = ['curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '5',
            '--write-out', '\n%{http_code}']
    if ca:
        args += ['--cacert', str(ca)]
    if target_port:
        args += ['--connect-to', HOST + ':443:127.0.0.1:' + target_port]
    for header in headers:
        args += ['--header', header]
    if data is not None:
        args += ['--header', 'Content-Type: application/json', '--data', data]
    result = subprocess.run([*args, url], check=True, text=True, capture_output=True)
    body, code = result.stdout.rsplit('\n', 1)
    return int(code), body


def expect_code(expected, *args, **kwargs):
    code, body = request(*args, **kwargs)
    assert code == expected, (expected, code, body)
    return body


try:
    docker('network', 'create', NETWORK)
    with tempfile.TemporaryDirectory(prefix=NAME) as directory:
        folder = Path(directory)
        (folder / 'gateway.py').write_text('''from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in {'/api/setup-gate', '/api/edge-rate-limit'}:
            self.send_response(204)
            self.end_headers()
            return
        if self.path != '/login' or self.server.server_port != 3000:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({name: self.headers.get_all(name) for name in
                ('X-Atlas-Client-IP', 'X-Forwarded-For', 'X-Atlas-Edge-Check')}).encode())
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(b'<form data-test="proxy-gateway-login"><input type="password"></form>')
    do_POST = do_GET
    def log_message(self, *_):
        pass
threading.Thread(target=ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever, daemon=True).start()
ThreadingHTTPServer(('0.0.0.0', 3000), Handler).serve_forever()
''')
        gateway = NAME + '-gateway'
        CONTAINERS.append(gateway)
        docker('run', '-d', '--name', gateway, '--network', NETWORK,
               '--network-alias', 'gateway-web', '--network-alias', 'identity-service', '-v', str(folder) + ':/test:ro',
               '--entrypoint', 'python3', IMAGE, '/test/gateway.py')
        # The initial probe must reject the front proxy's private CA. Replace
        # this file in place later so the next real probe can verify its chain.
        trust = folder / 'trust.pem'
        docker('cp', gateway + ':/etc/ssl/certs/ca-certificates.crt', str(trust))

        edge = NAME + '-edge'
        (folder / 'front.Caddyfile').write_text('''{
    admin off
    auto_https disable_redirects
}
https://''' + HOST + ''' {
    tls internal
    reverse_proxy edge:80 {
        header_up X-Forwarded-Proto https
        # Model a trusted upstream which appends its peer to an untrusted chain.
        header_up X-Forwarded-For "{header.X-Forwarded-For}, {remote_host}"
    }
}
:80 {
    reverse_proxy edge:80 {
        header_up X-Forwarded-Proto http
    }
}
''')
        front = NAME + '-front'
        CONTAINERS.append(front)
        docker('run', '-d', '--name', front, '--network', NETWORK,
               '--network-alias', HOST, '-p', '127.0.0.1::80', '-p', '127.0.0.1::443',
               '--tmpfs', '/data', '--tmpfs', '/config',
               '-v', str(folder / 'front.Caddyfile') + ':/test/front.Caddyfile:ro',
               '--entrypoint', 'caddy', IMAGE, 'run', '--config', '/test/front.Caddyfile',
               '--adapter', 'caddyfile')
        address = docker('inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', front, capture=True)
        CONTAINERS.append(edge)
        docker('run', '-d', '--name', edge, '--network', NETWORK,
               '--network-alias', 'edge', '-p', '127.0.0.1::80',
               '--tmpfs', '/data', '--tmpfs', '/config',
               '-v', str(folder) + ':/test:ro',
               '-e', 'PROFILE=ci', '-e', 'TLS_MODE=external-proxy',
               '-e', 'PUBLIC_BASE_URL=https://' + HOST,
               '-e', 'TLS_TRUSTED_PROXIES=' + address + '/32',
               '-e', 'SSL_CERT_FILE=/test/trust.pem', IMAGE)
        public_ca = folder / 'front-root.crt'
        for _ in range(45):
            copied = subprocess.run(['docker', 'exec', front, 'cat', '/data/caddy/pki/authorities/local/root.crt'],
                                    capture_output=True, text=True)
            if copied.returncode == 0:
                public_ca.write_text(copied.stdout)
                break
            time.sleep(1)
        else:
            raise RuntimeError('Front proxy did not create its test CA')
        edge_http = 'http://127.0.0.1:' + port(edge, 80)
        front_http = 'http://127.0.0.1:' + port(front, 80)
        front_port = port(front, 443)
        public = 'https://' + HOST
        tls = {'ca': public_ca, 'target_port': front_port}

        for _ in range(45):
            try:
                expect_code(403, edge_http + '/login', headers=['X-Forwarded-Proto: https'])
                expect_code(426, front_http + '/login')
                status = json.loads(expect_code(200, public + '/setup/transport/status', **tls))
                assert status['ready'] is False, status
                break
            except (subprocess.CalledProcessError, AssertionError, ValueError):
                time.sleep(1)
        else:
            raise RuntimeError('Proxy guards did not start in the closed state')

        progress = expect_code(503, public + '/login', **tls)
        assert 'Preparing a secure connection' in progress and '<input' not in progress.lower(), progress
        expect_code(503, public + '/api/identity/login', data='{"email":"synthetic","password":"synthetic"}', **tls)
        print('Proxy guards: untrusted spoof 403; trusted HTTP 426; unverified public TLS 503 without login form: passed')

        trust.write_bytes(public_ca.read_bytes())
        # urllib retains its default HTTPS opener/context. Installing a private
        # trust anchor is a deployment change, so restart the disposable edge as
        # a deployment would; no host-wide trust is changed.
        docker('restart', edge)
        edge_http = 'http://127.0.0.1:' + port(edge, 80)
        for _ in range(45):
            try:
                status = json.loads(expect_code(200, public + '/setup/transport/status', **tls))
                if status['ready']:
                    break
            except (subprocess.CalledProcessError, AssertionError, ValueError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Proxy HTTPS did not become ready after trusting the public CA')
        body = expect_code(200, public + '/login', **tls)
        assert 'proxy-gateway-login' in body and 'type="password"' in body, body
        expect_code(403, edge_http + '/login', headers=['X-Forwarded-Proto: https'])
        expect_code(403, edge_http + '/api/identity/login', headers=['X-Forwarded-Proto: https'], data='{}')
        expect_code(426, front_http + '/api/identity/login', data='{}')
        print('Proxy readiness: verified public certificate opens login; spoofed and insecure requests remain blocked: passed')

        baseline = json.loads(expect_code(200, public + '/security-header-probe', **tls))
        peer = baseline['X-Atlas-Client-IP']
        assert len(peer) == 1 and peer == baseline['X-Forwarded-For'], baseline
        for path in ('/oauth/register', '/api/identity/oauth/register', '/api/identity/login',
                     '/api/identity/passkeys/login/start', '/api/identity/password/reset/request',
                     '/security-header-probe', '/account'):
            for forged in ('203.0.113.99', '198.51.100.10, 203.0.113.99'):
                echoed = json.loads(expect_code(200, public + path, headers=[
                    'X-Forwarded-For: ' + forged, 'x-forwarded-for: 192.0.2.77',
                    'X-Atlas-Client-IP: 192.0.2.10', 'x-atlas-client-ip: 192.0.2.11',
                    'X-Atlas-Edge-Check: 1',
                ], data='{}', **tls))
                assert echoed['X-Atlas-Client-IP'] == peer, (path, echoed)
                assert echoed['X-Forwarded-For'] == peer, (path, echoed)
                if path in {'/security-header-probe', '/account'}:
                    assert echoed['X-Atlas-Edge-Check'] is None, (path, echoed)
        print('Proxy peer identity: forged chains and duplicate headers cannot change gateway/Identity rate-limit identities: passed')
except Exception:
    for container in CONTAINERS:
        subprocess.run(['docker', 'logs', '--tail', '35', container], check=False)
    raise
finally:
    for container in reversed(CONTAINERS):
        subprocess.run(['docker', 'rm', '-fv', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker', 'network', 'rm', NETWORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
