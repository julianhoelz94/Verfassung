#!/usr/bin/env python3
"""Validate merged-CI captures and build a static browser player; never publish."""
import argparse
import html
import json
from pathlib import Path
import shutil
import struct
import subprocess

SCREENSHOTS = ('reading-country', 'reading-text', 'reading-compare', 'account-security', 'admin-overview', 'admin-import', 'editor-draft', 'editor-review', 'editor-publish')
CLIPS = (('editing-a-draft', 'editor-draft', 45, 'Edit and submit', 'Bearbeiten und einreichen'), ('reviewing-a-draft', 'editor-review', 16, 'Review and approve', 'Prüfen und freigeben'), ('publishing-a-revision', 'editor-publish', 22, 'Publish the revision', 'Die Revision veröffentlichen'))


def command(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def prepare(source, output, revision):
    output.mkdir(parents=True, exist_ok=True)
    media = output / 'media'
    media.mkdir(exist_ok=True)
    manifest = {'revision': revision, 'screenshots': [], 'videos': []}
    sections = []
    for locale in ('en', 'de'):
        for name in SCREENSHOTS:
            image = source / f'{name}-{locale}.png'
            with image.open('rb') as stream:
                header = stream.read(24)
            if header[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', header[16:24]) != (1280, 900):
                raise ValueError(f'Invalid illustration: {image}')
            shutil.copy2(image, media / image.name)
            manifest['screenshots'].append(image.name)
        cards = []
        for name, poster, minimum, en, de in CLIPS:
            original = source / f'{name}-{locale}.webm'
            metadata = json.loads(command('ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(original)))
            stream = next(item for item in metadata['streams'] if item['codec_type'] == 'video')
            duration = float(metadata['format']['duration'])
            if (stream['width'], stream['height']) != (1280, 900) or not minimum <= duration <= 600:
                raise ValueError(f'Unexpected size or viewing duration: {original}: {duration}')
            result = source / f'{name}-{locale}.mp4'
            command('ffmpeg', '-y', '-v', 'error', '-i', str(original), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(result))
            # Decoding checks the actual complete output, not just its existence.
            command('ffmpeg', '-v', 'error', '-i', str(result), '-f', 'null', '-')
            shutil.copy2(result, media / result.name)
            manifest['videos'].append({'file': result.name, 'seconds': round(duration, 2)})
            title = html.escape(en if locale == 'en' else de)
            guide = 'Editorial-Guide' + ('-de' if locale == 'de' else '')
            action = 'Written steps' if locale == 'en' else 'Schriftliche Anleitung'
            cards.append(f'<article id="{name}-{locale}"><h3>{title}</h3><video controls playsinline preload="none" aria-label="{title}" poster="media/{poster}-{locale}.png"><source src="media/{result.name}" type="video/mp4"></video><p><a href="https://github.com/julianhoelz94/Verfassung/wiki/{guide}">{action}</a> · {round(duration)} s</p></article>')
        title = 'Editorial walkthroughs' if locale == 'en' else 'Redaktionelle Anleitungen'
        intro = 'Silent walkthroughs using fictional content. Use play, pause, seek, speed and fullscreen controls in the player. The linked guide describes the same steps.' if locale == 'en' else 'Anleitungen ohne Ton mit fiktiven Inhalten. Nutzen Sie Wiedergabe, Pause, Zeitleiste, Geschwindigkeit und Vollbild im Player. Die verlinkte Anleitung beschreibt dieselben Schritte.'
        sections.append(f'<section id="{locale}" lang="{locale}"><h2>{title}</h2><p>{intro}</p>{"".join(cards)}</section>')
    document = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Constitution Atlas editorial video walkthroughs"><title>Constitution Atlas — walkthroughs</title><style>
body{margin:0;background:#f6f5ef;color:#183238;font:17px/1.6 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:24px}a{color:#075b62}nav{display:flex;flex-wrap:wrap;gap:24px}article{background:white;border:1px solid #ccd7d5;border-radius:12px;padding:20px;margin:28px 0;scroll-margin-top:18px}h1,h2,h3{line-height:1.2}h2{margin-top:64px}video{display:block;width:100%;height:auto;background:#112b30;border-radius:6px}p{max-width:75ch}:focus-visible{outline:3px solid #b45309;outline-offset:4px}@media(max-width:600px){main{padding:16px}article{padding:12px}}
</style></head><body><main><h1>Constitution Atlas</h1><nav aria-label="Guide navigation"><a href="#en">English</a><a href="#de" lang="de">Deutsch</a><a href="https://github.com/julianhoelz94/Verfassung/wiki">Documentation / Dokumentation</a></nav>'''
    document += ''.join(sections) + f'<footer><p>Captured from merged source <code>{html.escape(revision)}</code>.</p></footer></main></body></html>'
    (output / 'index.html').write_text(document)
    (output / '.nojekyll').touch()
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    # Keep old public WebM URLs working without publishing stale clips.
    for name, *_ in CLIPS:
        shutil.copy2(source / f'{name}-en.webm', source / f'{name}.webm')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    prepare(args.source, args.output, args.revision)
