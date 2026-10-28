"""OPS-1: media publication requires complete, revision-bound viewing assets.

Only the ffmpeg/ffprobe process boundary is faked; metadata validation, copying,
manifest generation and browser-player creation execute normally. CI still
performs real encoding, decoding and browser playback.
"""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

SPEC = importlib.util.spec_from_file_location('wiki_media', Path(__file__).resolve().parents[1] / 'prepare-wiki-media.py')
media = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media)


def png(width, height):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress((b'\x00' + b'\xff\xff\xff' * width) * height)) + chunk(b'IEND', b''))


class WikiMediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'captures'
        self.source.mkdir()
        self.output = Path(self.temp.name) / 'player'
        image = png(1280, 900)
        for locale in ('en', 'de'):
            for screenshot in media.SCREENSHOTS:
                (self.source / f'{screenshot}-{locale}.png').write_bytes(image)
            for name, *_ in media.CLIPS:
                (self.source / f'{name}-{locale}.webm').write_bytes(b'fictional codec input')
        self.duration = 90
        self.width = 1280
        self.calls = []

    def codec(self, *arguments):
        self.calls.append(arguments)
        if arguments[0] == 'ffprobe':
            return json.dumps({'streams': [{'codec_type': 'audio'}, {'codec_type': 'video', 'width': self.width, 'height': 900}], 'format': {'duration': str(self.duration)}})
        if arguments[-1] != '-':
            Path(arguments[-1]).write_bytes(b'fictional encoded output')
        return ''

    def prepare(self):
        with patch.object(media, 'command', side_effect=self.codec):
            media.prepare(self.source, self.output, 'verified-revision')

    def test_complete_capture_produces_revision_bound_bilingual_player_and_manifest(self):
        self.prepare()
        manifest = json.loads((self.output / 'manifest.json').read_text())
        self.assertEqual(manifest['revision'], 'verified-revision')
        self.assertEqual(len(manifest['screenshots']), 18)
        self.assertEqual(len(manifest['videos']), 6)
        self.assertEqual({video['seconds'] for video in manifest['videos']}, {90})
        player = (self.output / 'index.html').read_text()
        self.assertEqual(player.count('<video controls playsinline preload="none"'), 6)
        self.assertIn('lang="de"', player)
        self.assertIn('verified-revision', player)
        self.assertIn('Editorial-Guide-de', player)
        decodes = [call for call in self.calls if '-f' in call and call[-1] == '-']
        self.assertEqual(len(decodes), 6)
        for video in manifest['videos']:
            self.assertEqual((self.output / 'media' / video['file']).read_bytes(), b'fictional encoded output')
        self.assertTrue((self.output / '.nojekyll').exists())
        self.assertEqual((self.source / 'editing-a-draft.webm').read_bytes(), (self.source / 'editing-a-draft-en.webm').read_bytes())

    def test_invalid_illustration_is_rejected_before_any_video_processing(self):
        (self.source / 'reading-country-en.png').write_bytes(png(640, 480))
        with self.assertRaisesRegex(ValueError, 'Invalid illustration'):
            self.prepare()
        self.assertEqual(self.calls, [])
        self.assertFalse((self.output / 'manifest.json').exists())

    def test_missing_capture_cannot_produce_a_success_manifest(self):
        (self.source / 'reading-text-en.png').unlink()
        with self.assertRaises(FileNotFoundError):
            self.prepare()
        self.assertFalse((self.output / 'manifest.json').exists())

    def test_too_short_or_long_videos_cannot_be_published_as_human_viewing_speed(self):
        for duration in (1, 601):
            with self.subTest(duration=duration):
                self.duration = duration
                with self.assertRaisesRegex(ValueError, 'Unexpected size or viewing duration'):
                    self.prepare()
                self.assertFalse((self.output / 'manifest.json').exists())

    def test_wrong_video_dimensions_are_rejected(self):
        self.width = 640
        with self.assertRaisesRegex(ValueError, 'Unexpected size or viewing duration'):
            self.prepare()

    def test_decode_failure_does_not_produce_a_success_manifest(self):
        def failing_codec(*arguments):
            if arguments[-1] == '-':
                raise RuntimeError('decoder rejected output')
            return self.codec(*arguments)
        with patch.object(media, 'command', side_effect=failing_codec), self.assertRaisesRegex(RuntimeError, 'decoder rejected'):
            media.prepare(self.source, self.output, 'verified-revision')
        self.assertFalse((self.output / 'manifest.json').exists())

    def test_process_failure_retains_the_tool_diagnostic(self):
        with patch.object(media.subprocess, 'run') as run:
            run.return_value.returncode = 1
            run.return_value.stderr = 'bad codec input\n'
            with self.assertRaisesRegex(RuntimeError, 'ffmpeg failed: bad codec input'):
                media.command('ffmpeg', '-version')


if __name__ == '__main__':
    unittest.main()
