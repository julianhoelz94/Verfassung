import unittest
import transport


class TransportTest(unittest.TestCase):
    def setUp(self):
        transport.STATUS.clear()
        transport.STATUS.update(state="preparing", ready=False, message="Preparing HTTPS")

    def env(self, mode="local-http", **extra):
        return dict(PROFILE="local-stack", TLS_MODE=mode, PUBLIC_BASE_URL="http://localhost" if mode == "local-http" else "https://localhost", **extra)

    def test_local_http_needs_no_ca_and_enforces_setup(self):
        config = transport.render(self.env())
        self.assertNotIn("issuer acme", config)
        self.assertIn("forward_auth gateway-web:3000", config)
        self.assertIn("/api/setup-gate", config)

    def test_production_cannot_enable_local_mode(self):
        env = self.env()
        env["PROFILE"] = "production"
        with self.assertRaises(ValueError):
            transport.render(env)
        with self.assertRaises(ValueError):
            transport.render(self.env(CADDY_BIND_ADDRESS="0.0.0.0"))

    def test_local_https_uses_internal_ca(self):
        self.assertIn("tls internal", transport.render(self.env("local-https")))

    def test_controlled_legacy_alias_gets_a_certificate_and_preserves_redirect_uri(self):
        env = dict(PROFILE="production", TLS_MODE="managed-acme", PUBLIC_BASE_URL="https://atlas.example.org", ATLAS_LEGACY_HOST="legacy.example.org")
        config = transport.render(env)
        self.assertIn("https://legacy.example.org", config)
        self.assertIn("redir @legacy_host https://legacy.example.org{uri} 308", config)
        self.assertNotIn("https://legacy.localhost", transport.render(dict(env, ATLAS_LEGACY_HOST="legacy.localhost")))
        for host in ["evil.example/path", "*.example.org", "host\\n{", "host:443"]:
            with self.assertRaises(ValueError):
                transport.render(dict(env, ATLAS_LEGACY_HOST=host))

    def test_acme_is_pinned_to_letsencrypt_http_challenge(self):
        env = dict(PROFILE="production", TLS_MODE="managed-acme", PUBLIC_BASE_URL="https://atlas.example.org", ACME_TEST_DIRECTORY="https://attacker.example/directory")
        config = transport.render(env)
        self.assertIn("acme-v02.api.letsencrypt.org", config)
        self.assertNotIn("attacker.example", config)
        self.assertIn("disable_tlsalpn_challenge", config)
        self.assertIn("reverse_proxy 127.0.0.1:8081", config)

    def test_proxy_requires_explicit_trusted_addresses_and_scheme(self):
        with self.assertRaises(ValueError):
            transport.render(self.env("external-proxy"))
        with self.assertRaises(ValueError):
            transport.render(self.env("external-proxy", TLS_TRUSTED_PROXIES="0.0.0.0/0"))
        config = transport.render(self.env("external-proxy", TLS_TRUSTED_PROXIES="10.42.0.3/32"))
        self.assertIn("@untrusted not remote_ip 10.42.0.3/32", config)
        self.assertIn("@insecure not header X-Forwarded-Proto https", config)
        self.assertNotIn("issuer acme", config)

    def test_rejects_config_injection_and_noncanonical_origins(self):
        for url in ["https://evil.example/other", "https://evil.example?x=1", "https://user:password@evil.example", "https://*.example.org", "https://evil.example%0a{", "http://example.org"]:
            env = self.env("managed-acme")
            env["PUBLIC_BASE_URL"] = url
            with self.assertRaises(ValueError):
                transport.render(env)

    def test_issuance_events_report_real_progress_and_safe_errors(self):
        transport.observe('{"logger":"tls.obtain","msg":"obtaining certificate"}')
        self.assertEqual("validating", transport.STATUS["state"])
        transport.observe('{"logger":"tls.obtain","msg":"certificate obtained successfully"}')
        self.assertEqual("checking", transport.STATUS["state"])
        self.assertFalse(transport.STATUS["ready"])
        transport.observe('{"logger":"tls.obtain","level":"error","error":"DNS NXDOMAIN secret@example.org"}')
        self.assertEqual("failed", transport.STATUS["state"])
        self.assertNotIn("secret", transport.STATUS["message"])

    def test_renewal_failure_stays_visible_while_previous_certificate_is_valid(self):
        transport.record_readiness(True)
        transport.observe('{"logger":"tls.renew","level":"error","error":"DNS NXDOMAIN private-value"}')
        warning = transport.STATUS["lastCertificateError"]
        transport.record_readiness(True)
        self.assertTrue(transport.STATUS["ready"])
        self.assertEqual(warning, transport.STATUS["lastCertificateError"])
        self.assertNotIn("private-value", warning)
        transport.observe('{"logger":"tls.renew","msg":"certificate renewed successfully"}')
        self.assertIsNone(transport.STATUS["lastCertificateError"])


if __name__ == "__main__":
    unittest.main()
