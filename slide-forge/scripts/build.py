#!/usr/bin/env python3
"""Assemble editor-template.html from src/ modules.

The deliverable stays a single self-contained file; this build exists so the
tool itself is developable (src/engine.js, src/editor.js, ...) without hand-
editing a 4,000-line HTML file. Injection is plain marker substitution — no
minification, no transforms — so the built file is exactly what you read in src.

Usage:  python3 scripts/build.py [--out editor-template.html]
Enforces the v2 size budget: 450 KB uncompressed for the TEMPLATE/CODE only
(built with an empty deck-assets registry, see %DECK_ASSETS% below). This is
NOT a cap on delivered decks — media plan §7.3 deliberately drops any size
ceiling on user-supplied imagery embedded via scripts/assets.py or the
in-editor asset library: a 12 MB deck (because the user supplied 12 MB of
images) is the correct, expected outcome, not a regression to "fix".
"""
import sys, os, json, hashlib, argparse, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'src')
BUDGET = 450 * 1024

PARTS = {                       # marker -> src file
    '%SG_JS%':       'sg.js',
    '%DECK_CSS%':    'deck.css',
    '%ANIM_CSS%':    'anim.css',
    '%ANIM_JS%':     'anim.js',
    '%ENGINE_CSS%':  'engine.css',
    '%CHARTS_JS%':   'charts.js',
    '%ENGINE_JS%':   'engine.js',
    '%SECTIONS_JS%': 'sections.js',
    '%EDITOR_CSS%':  'editor.css',
    '%EDITOR_JS%':   'editor.js',
    '%MEDIA_JS%':    'media.js',
    '%DECK_DATA%':   'deck-data.json',
}

def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read().rstrip('\n')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'editor-template.html'))
    ap.add_argument('--check', action='store_true', help='verify the existing output matches src (no write)')
    a = ap.parse_args()

    html = read('shell.html')
    for marker, fname in PARTS.items():
        if marker not in html:
            sys.exit('marker %s missing from shell.html' % marker)
        html = html.replace(marker, read(fname))

    data = json.loads(read('deck-data.json'))               # validate the default deck
    title = (data.get('meta') or {}).get('title', 'deck')
    html = html.replace('%TITLE%', title)
    html = html.replace('%DECK_ASSETS%', '{"icons":{},"images":{},"styles":""}')

    h = hashlib.sha1(html.encode('utf-8')).hexdigest()[:10]
    # stamp is hash-only so rebuilds of unchanged src are byte-identical (no date noise)
    html = html.replace('%BUILD%', 'v3 build %s' % h)

    leftover = [m for m in ('%SG_JS%','%DECK_CSS%','%ANIM_CSS%','%ANIM_JS%','%ENGINE_CSS%','%CHARTS_JS%',
                            '%ENGINE_JS%','%SECTIONS_JS%','%EDITOR_CSS%','%EDITOR_JS%','%MEDIA_JS%','%DECK_DATA%','%DECK_ASSETS%','%TITLE%','%BUILD%')
                if m in html]
    if leftover:
        sys.exit('unresolved markers: %s' % leftover)

    size = len(html.encode('utf-8'))
    if size > BUDGET:
        sys.exit('FAIL: built template is %d KB (budget %d KB)' % (size//1024, BUDGET//1024))

    if a.check:
        cur = open(a.out, encoding='utf-8').read() if os.path.exists(a.out) else ''
        sys.exit(0 if cur == html else 'STALE: %s does not match src/ — run build.py' % os.path.relpath(a.out, ROOT))
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(html)
    gz = len(zlib.compress(html.encode('utf-8'), 9))
    print('built %s — %d KB raw / %d KB gzipped (budget %d KB), %d slides in default deck, hash %s'
          % (os.path.relpath(a.out, ROOT), size//1024, gz//1024, BUDGET//1024, len(data.get('slides', [])), h))

if __name__ == '__main__':
    main()
