#!/usr/bin/env python3
"""Build a browser-checkable demo deck from the current template + a deck JSON.

The Node suites (parity.mjs / editor-ops.mjs) cover structure and the data
layer; they cannot see layout. This produces a real .html so composed slides
can be eyeballed beside their classic originals in a browser — the "proof"
step every composer slice ends with.

Usage:  python3 tests/make-demo.py [tests/composed-demo.json] [-o tests/composed-demo.html]
"""
import os, re, sys, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ap = argparse.ArgumentParser()
ap.add_argument('deck', nargs='?', default=os.path.join(HERE, 'composed-demo.json'))
ap.add_argument('-o', '--out', default=None)
a = ap.parse_args()
out = a.out or os.path.splitext(a.deck)[0] + '.html'

html = open(os.path.join(ROOT, 'editor-template.html'), encoding='utf-8').read()
data = open(a.deck, encoding='utf-8').read().strip()
html, n = re.subn(r'(<script type="application/json" id="deck-data">)[\s\S]*?(</script>)',
                  lambda m: m.group(1) + '\n' + data + '\n' + m.group(2), html, count=1)
if n != 1:
    sys.exit('deck-data block not found in editor-template.html')
open(out, 'w', encoding='utf-8').write(html)
print('wrote %s (%d KB)' % (os.path.relpath(out, ROOT), len(html.encode('utf-8')) // 1024))
