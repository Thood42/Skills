#!/usr/bin/env python3
"""Round-trip a deck's content between its .html and a .json file.

The deck stores its entire content in <script id="deck-data">. This tool lets
you edit that content as a file and write it back, which keeps the headless
renderer authoritative (it always has a concrete .html) while letting people
edit JSON outside the browser.

Usage:
  python3 scripts/deckdata.py extract deck.html [out.json]   # pull JSON out
  python3 scripts/deckdata.py inject  deck.html data.json     # write JSON back in
"""
import sys, re, json, argparse

PAT = re.compile(r'(<script[^>]*type="application/json"[^>]*id="deck-data"[^>]*>)(.*?)(</script>)', re.S)

def extract(html_path, out=None):
    html=open(html_path,encoding='utf-8').read()
    m=PAT.search(html)
    if not m: sys.exit('no <script id="deck-data"> found in '+html_path)
    data=json.loads(m.group(2))
    text=json.dumps(data,indent=2,ensure_ascii=False)
    if out: open(out,'w',encoding='utf-8').write(text); print('wrote '+out)
    else: print(text)

def inject(html_path, json_path):
    html=open(html_path,encoding='utf-8').read()
    data=json.load(open(json_path,encoding='utf-8'))          # validate
    if not PAT.search(html): sys.exit('no <script id="deck-data"> found in '+html_path)
    body=json.dumps(data,indent=2,ensure_ascii=False)
    new=PAT.sub(lambda m: m.group(1)+'\n'+body+'\n'+m.group(3), html, count=1)
    open(html_path,'w',encoding='utf-8').write(new)
    print('injected %d slides into %s'%(len(data.get('slides',[])), html_path))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['extract','inject'])
    ap.add_argument('html'); ap.add_argument('arg', nargs='?')
    a=ap.parse_args()
    if a.cmd=='extract': extract(a.html, a.arg)
    else:
        if not a.arg: sys.exit('inject needs a JSON file')
        inject(a.html, a.arg)

if __name__=='__main__': main()
