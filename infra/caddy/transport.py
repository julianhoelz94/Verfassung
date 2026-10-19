"""Small edge supervisor: Caddy owns ACME, private keys, renewal and routing.

The public HTTP listener serves only credential-free progress until TLS is ready.
There is no public configuration or Caddy administration API.
"""
import html
import ipaddress
import json
import os
import re
import signal
import socket
import ssl
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MODES = {"local-http", "local-https", "managed-acme", "external-proxy"}
STATUS = {"state": "preparing", "ready": False, "message": "Preparing HTTPS / HTTPS wird vorbereitet"}
LOCK = threading.Lock()


def configuration(env):
    mode = env.get("TLS_MODE", "local-http")
    profile = env.get("PROFILE", "local-stack")
    origin = env.get("PUBLIC_BASE_URL", "http://localhost").rstrip("/")
    url = urlsplit(origin)
    if mode not in MODES or not url.hostname or url.username or url.password or url.query or url.fragment or url.path:
        raise ValueError("Invalid TLS_MODE or PUBLIC_BASE_URL")
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", url.hostname) or "*" in url.hostname:
        raise ValueError("PUBLIC_BASE_URL must use a DNS hostname without wildcards")
    if mode == "local-http" and env.get("CADDY_BIND_ADDRESS", "127.0.0.1") not in {"127.0.0.1", "::1"}:
        raise ValueError("Local HTTP must bind published ports to loopback")
    if mode.startswith("local-") and (profile not in {"local-stack", "testing", "ci"} or url.hostname != "localhost"):
        raise ValueError("Local TLS modes require localhost and an explicit development profile")
    if url.scheme != ("http" if mode == "local-http" else "https"):
        raise ValueError("TLS mode and public URL scheme disagree")
    if mode == "managed-acme" and url.port not in {None, 443}:
        raise ValueError("Managed HTTPS requires public port 443")
    proxies = []
    if mode == "external-proxy":
        proxies = env.get("TLS_TRUSTED_PROXIES", "").split()
        if not proxies or any(ipaddress.ip_network(item).prefixlen == 0 for item in proxies):
            raise ValueError("Explicit TLS_TRUSTED_PROXIES CIDRs are required")
    return mode, origin, url, proxies


def render(env):
    mode, origin, url, proxies = configuration(env)
    globals_ = ["auto_https disable_redirects", "admin unix//run/caddy/admin.sock"]
    if proxies:
        globals_.append("servers {\n trusted_proxies static " + " ".join(proxies) + "\n trusted_proxies_strict\n}")
    common = """
    route {
        handle /setup/transport/status {
            reverse_proxy 127.0.0.1:8081
        }
        forward_auth gateway-web:3000 {
            uri /api/setup-gate
            header_up X-Atlas-Edge-Check 1
            header_up X-Atlas-Original-URI {uri}
        }
        import atlas_routes
    }
"""
    prelude = "{\n" + "\n".join(globals_) + "\n}\nimport /etc/caddy/Caddyfile\n"
    if mode == "local-http":
        return prelude + ":80 {\n" + common + "}\n"
    if mode == "external-proxy":
        guard = "\n@untrusted not remote_ip " + " ".join(proxies) + "\nrespond @untrusted 403\n@insecure not header X-Forwarded-Proto https\nrespond @insecure 426\n"
        return prelude + ":80 {\n" + guard + common + "}\n"
    if mode == "local-https":
        tls = "tls internal"
    else:
        # Production never accepts a caller-selected ACME server. The isolated test
        # profile may use Pebble/staging without changing production issuer policy.
        ca = "https://acme-v02.api.letsencrypt.org/directory"
        if env.get("PROFILE") in {"ci", "testing"}:
            ca = env.get("ACME_TEST_DIRECTORY", ca)
            if any(char in ca for char in "\n\r{} "):
                raise ValueError("Invalid ACME test directory")
        tls = "tls {\nissuer acme {\n dir " + ca + "\n disable_tlsalpn_challenge\n}\n}"
    return prelude + "https://" + url.hostname + " {\n" + tls + common + "}\n:80 {\nreverse_proxy 127.0.0.1:8081\n}\n"


def update(**values):
    with LOCK:
        STATUS.update(values)


def observe(line):
    try:
        event = json.loads(line)
    except (ValueError, TypeError):
        return
    logger, message = event.get("logger", ""), event.get("msg", "")
    if logger.startswith("tls.obtain") and "obtaining certificate" in message:
        update(state="validating", ready=False, message="Validating domain and issuing certificate / Domainprüfung und Zertifikatsausstellung")
    elif logger.startswith("tls.obtain") and "certificate obtained successfully" in message:
        update(state="checking", ready=False, message="Certificate issued; checking HTTPS / Zertifikat ausgestellt; HTTPS wird geprüft")
    elif event.get("level") == "error" and logger.startswith("tls"):
        error = str(event.get("error", "")).lower()
        if "dns" in error or "nxdomain" in error:
            message = "Check the public DNS A/AAAA records / Öffentliche DNS-Einträge A/AAAA prüfen"
        elif "ratelimit" in error or "rate limit" in error:
            message = "Certificate authority rate limit; automatic retry pending / CA-Ratenlimit; automatischer Neuversuch folgt"
        else:
            message = "Certificate validation failed. Check DNS and public ports 80/443; Caddy will retry / Zertifikatsprüfung fehlgeschlagen. DNS und öffentliche Ports 80/443 prüfen; Caddy versucht es erneut"
        update(state="failed", message=message)


def probe(mode, url):
    context = ssl.create_default_context()
    if mode == "local-https":
        root = Path("/data/caddy/pki/authorities/local/root.crt")
        if not root.is_file():
            return False
        context.load_verify_locations(str(root))
    # Caddy terminates direct TLS locally. SNI/hostname and the full trust chain
    # are verified; no arbitrary URL or address supplied by a browser is used.
    try:
        with socket.create_connection(("127.0.0.1", 443), timeout=2) as connection:
            with context.wrap_socket(connection, server_hostname=url.hostname) as tls:
                certificate = tls.getpeercert()
                update(expiresAt=certificate.get("notAfter"))
        return True
    except (OSError, ssl.SSLError):
        return False


def main():
    mode, origin, url, _ = configuration(os.environ)
    os.environ["ATLAS_CANONICAL_HOST"] = url.netloc
    config = Path("/config/atlas.Caddyfile")
    config.parent.mkdir(parents=True, exist_ok=True)
    Path("/run/caddy").mkdir(parents=True, exist_ok=True)
    config.write_text(render(os.environ))
    update(mode=mode, publicUrl=origin)
    if mode == "local-http":
        update(state="local", ready=True, message="Local development — HTTPS not required / Lokale Entwicklung — HTTPS nicht erforderlich")
    elif mode == "external-proxy":
        update(state="proxy", ready=True, message="HTTPS managed by the trusted reverse proxy / HTTPS durch den vertrauenswürdigen Reverse-Proxy")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            with LOCK:
                state = dict(STATUS)
            if self.path.split("?")[0] == "/setup/transport/status":
                body = json.dumps(state).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
            elif state["ready"] and mode in {"managed-acme", "local-https"}:
                self.send_response(303)
                self.send_header("Location", origin + "/login")
                body = b""
            else:
                # No script or password form is served over HTTP. Refreshes also
                # cause the redirect as soon as certificate verification succeeds.
                body = ("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><meta http-equiv=refresh content=3><title>HTTPS setup</title><main style='max-width:38rem;margin:4rem auto;padding:1rem;font:1.1rem system-ui'><h1>Preparing a secure connection / Sichere Verbindung vorbereiten</h1><p>" + html.escape(state["message"]) + "</p><p>This page refreshes automatically. Login becomes available over HTTPS. / Diese Seite aktualisiert sich automatisch. Die Anmeldung erfolgt über HTTPS.</p></main></html>").encode()
                self.send_response(503 if state["state"] == "failed" else 200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            self.send_response(426)
            self.end_headers()

        do_PUT = do_POST
        do_PATCH = do_POST
        do_DELETE = do_POST

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 8081), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    process = subprocess.Popen(["caddy", "run", "--config", str(config), "--adapter", "caddyfile"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    def stop(*_):
        process.terminate()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def monitor():
        while process.poll() is None:
            if mode in {"managed-acme", "local-https"}:
                valid = probe(mode, url)
                if valid:
                    update(state="ready", ready=True, message="HTTPS ready / HTTPS bereit")
                elif STATUS["ready"]:
                    update(state="failed", ready=False, message="HTTPS certificate unavailable / HTTPS-Zertifikat nicht verfügbar")
            time.sleep(2)
    threading.Thread(target=monitor, daemon=True).start()
    for line in process.stdout:
        observe(line)
        print(line, end="", flush=True)
    raise SystemExit(process.wait())


if __name__ == "__main__":
    main()
