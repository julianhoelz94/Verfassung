"""Exercise local-stack orchestration with a fake engine; no images are compiled."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest


FAKE_DOCKER = r'''#!/usr/bin/env python3
import json, os, sys, time
from pathlib import Path
args = sys.argv[1:]
root = Path(os.environ['FAKE_ENGINE'])
with (root / 'events').open('a') as log:
    log.write(json.dumps(args) + '\n')
if args[0] == 'create':
    try:
        (root / 'lock').touch(exist_ok=False)
    except FileExistsError:
        sys.exit(1)
elif args[0] == 'rm':
    (root / 'lock').unlink(missing_ok=True)
elif args[0] == 'compose' and 'exec' in args:
    if any('setup/status' in arg for arg in args):
        print(os.environ.get('FAKE_SETUP_STATUS', 'complete local-http localhost'))
        sys.exit(0)
    if args[-1].endswith('/root.crt'):
        print('public-test-root')
        sys.exit(0)
    if os.environ.get('FAKE_DOCUMENT_DOWN') == '1':
        print('Not ready: document', file=sys.stderr)
        sys.exit(1)
    print('Healthy: document')
elif args[0] == 'compose' and 'build' in args:
    (root / 'active-build').touch(exist_ok=False)
    time.sleep(float(os.environ.get('FAKE_BUILD_DELAY', '0')))
    (root / 'active-build').unlink()
    if args[-1] == os.environ.get('FAKE_BUILD_FAIL'):
        sys.exit(42)
'''


class LocalStackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copy(Path(__file__).resolve().parents[1] / 'manageLocalStack.sh', self.root)
        (self.root / 'env').mkdir()
        (self.root / 'env/local-stack.env.example').write_text('CADDY_PORT=80\n')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        for name, content in {
            'docker': FAKE_DOCKER,
            'curl': '#!/bin/sh\nexit 0\n',
            'sleep': '#!/bin/sh\nexit 0\n',
        }.items():
            tool = self.bin / name
            tool.write_text(content)
            tool.chmod(0o755)
        self.env = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}',
                    'FAKE_ENGINE': str(self.root), 'HTTP_READY_TIMEOUT_SECONDS': '0',
                    'MIN_FREE_MB': '0'}

    def run_stack(self, *args, **env):
        return subprocess.run(['bash', 'manageLocalStack.sh', *args], cwd=self.root,
                              env={**self.env, **env}, capture_output=True, text=True, timeout=20)

    def events(self):
        return [json.loads(line) for line in (self.root / 'events').read_text().splitlines()]

    def test_serial_container_builds_and_cleanup(self):
        result = self.run_stack('--start', '--no-prepopulate')
        self.assertEqual(result.returncode, 0, result.stderr)
        builds = [args for args in self.events() if args[0] == 'compose' and 'build' in args]
        self.assertEqual(len(builds), 12)
        self.assertTrue(all(args[args.index('--parallel') + 1] == '1' for args in builds))
        self.assertFalse((self.root / 'lock').exists())
        self.assertIn('Healthy: document', result.stdout)
        self.assertIn('Build finished (exit 0)', (self.root / '.local-stack/build.log').read_text())

    def test_build_failure_stops_before_starting_stack_and_releases_lock(self):
        result = self.run_stack('--start', FAKE_BUILD_FAIL='catalog-service')
        self.assertEqual(result.returncode, 42, result.stderr)
        events = self.events()
        self.assertFalse(any(args[-1:] == ['content-service'] for args in events))
        self.assertFalse(any('up' in args and 'build-monitor' not in args for args in events))
        self.assertFalse((self.root / 'lock').exists())
        self.assertIn('Build finished (exit 42)', (self.root / '.local-stack/build.log').read_text())

    def test_verification_is_forwarded_to_container_without_building(self):
        result = self.run_stack('--only-prepopulate', '--verify-only')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any(args[-2:] == ['prepopulate', '--verify-only'] for args in self.events()))
        self.assertFalse(any('build' in args for args in self.events()))

    def test_pending_setup_skips_fixture_authentication(self):
        result = self.run_stack('--only-prepopulate', FAKE_SETUP_STATUS='pending local-http localhost')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Complete first-deployment setup', result.stdout)
        self.assertFalse(any('run' in args for args in self.events()))

    def test_local_https_exports_only_public_ca_for_fixture_container(self):
        result = self.run_stack('--only-prepopulate', '--verify-only', FAKE_SETUP_STATUS='complete local-https localhost')
        self.assertEqual(result.returncode, 0, result.stderr)
        run = next(args for args in self.events() if args[0] == 'compose' and 'run' in args)
        self.assertIn('PREPOPULATE_BASE_URL=https://localhost', run)
        self.assertIn('NODE_EXTRA_CA_CERTS=/local-state/local-root.crt', run)
        self.assertEqual(run[-2:], ['prepopulate', '--verify-only'])
        self.assertEqual((self.root / '.local-stack/local-root.crt').read_text(), 'public-test-root\n')

    def test_no_prepopulate_still_requires_document_health(self):
        result = self.run_stack('--start', '--no-build', '--no-prepopulate', FAKE_DOCUMENT_DOWN='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Not ready: document', result.stdout)
        self.assertNotIn('Started.', result.stdout)

    def test_existing_env_gets_missing_defaults_without_replacing_values(self):
        (self.root / 'env/local-stack.env').write_text('CADDY_PORT=8088\nexport LOCAL_ADMIN_PASSWORD="keep-me"\n')
        (self.root / 'env/local-stack.env.example').write_text('CADDY_PORT=80\nLOCAL_ADMIN_PASSWORD=default\nINGESTION_PUBLISH_TOKEN=local-token\n')
        first = self.run_stack('--start', '--no-build', '--no-prepopulate')
        self.assertEqual(first.returncode, 0, first.stderr)
        expected = (self.root / 'env/local-stack.env').read_text()
        self.assertIn('CADDY_PORT=8088', expected)
        self.assertIn('export LOCAL_ADMIN_PASSWORD="keep-me"', expected)
        self.assertNotIn('LOCAL_ADMIN_PASSWORD=default', expected)
        self.assertEqual(expected.count('INGESTION_PUBLISH_TOKEN='), 1)
        second = self.run_stack('--start', '--no-build', '--no-prepopulate')
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual((self.root / 'env/local-stack.env').read_text(), expected)

    def test_second_invocation_cannot_compile_or_release_first_lock(self):
        first = subprocess.Popen(['bash', 'manageLocalStack.sh', '--start', '--no-prepopulate'],
                                 cwd=self.root, env={**self.env, 'FAKE_BUILD_DELAY': '0.15'},
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: first.poll() is None and first.kill())
        deadline = time.monotonic() + 5
        while not (self.root / 'active-build').exists():
            self.assertLess(time.monotonic(), deadline)
            time.sleep(0.01)
        second = self.run_stack('--rebuild', 'gateway')
        self.assertNotEqual(second.returncode, 0)
        self.assertIn('Another local-stack build', second.stderr)
        self.assertTrue((self.root / 'lock').exists())
        stdout, stderr = first.communicate(timeout=20)
        self.assertEqual(first.returncode, 0, stdout + stderr)
        self.assertFalse((self.root / 'lock').exists())


if __name__ == '__main__':
    unittest.main()
