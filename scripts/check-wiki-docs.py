#!/usr/bin/env python3
"""Check guide navigation and the CI illustration contract without capturing media."""
from pathlib import Path
import re
from importlib.util import spec_from_file_location, module_from_spec
root = Path(__file__).resolve().parents[1]
wiki = root / 'docs/wiki'
deployment_spec = spec_from_file_location('deployment_wiki', root / 'scripts/sync-deployment-wiki.py')
deployment_wiki = module_from_spec(deployment_spec)
deployment_spec.loader.exec_module(deployment_wiki)
deployment_wiki.sync(check=True)
spec = spec_from_file_location('media', root / 'scripts/prepare-wiki-media.py')
media = module_from_spec(spec)
spec.loader.exec_module(media)
expected = {f'{name}-{locale}.png' for name in media.SCREENSHOTS for locale in ('en', 'de')}
referenced = set()
for page in wiki.glob('*.md'):
    text = page.read_text()
    for link in re.findall(r'\[\[([^\]]+)\]\]', text):
        target = link.split('|')[-1].split('#')[0]
        assert (wiki / f'{target}.md').is_file(), f'{page.name}: missing Wiki target {target}'
    for alt, filename in re.findall(r'!\[([^\]]*)\]\((?:[^)]*/)?media/([^/)]+)\)', text):
        assert alt.strip(), f'{page.name}: illustration needs alt text'
        assert filename in expected, f'{page.name}: undeclared illustration {filename}'
        referenced.add(filename)
assert referenced == expected, f'Illustrations missing from guides: {expected - referenced}'
readme = (root / 'README.md').read_text()
assert 'https://github.com/julianhoelz94/Verfassung/wiki' in readme
assert not re.search(r'status.*live in.*backlog', readme)
print(f'Checked {len(list(wiki.glob("*.md")))} Wiki pages and {len(expected)} illustration references.')
