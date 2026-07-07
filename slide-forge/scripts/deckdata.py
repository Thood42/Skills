#!/usr/bin/env python3
"""Round-trip a deck's content between its .html and a .json file.

The deck stores its entire content in <script id="deck-data">. This tool lets
you edit that content as a file and write it back, which keeps the headless
renderer authoritative (it always has a concrete .html) while letting people
edit JSON outside the browser.

Usage:
  python3 scripts/deckdata.py extract deck.html [out.json]    # pull JSON out
  python3 scripts/deckdata.py inject  deck.html data.json     # write JSON back in
  python3 scripts/deckdata.py template extract deck.html pack.json
      # strip slide content -> a reusable template PACK (theme + brand +
      # masters + slide skeletons with placeholder text)
  python3 scripts/deckdata.py template apply pack.json deck.html
      # restyle/skeleton a deck (a fresh copy of editor-template.html)
      # from a pack: "build this deck using my team's template"
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

# ---- template packs (v2 phase 4) -------------------------------------------
PLACEHOLDER = {
  'title':'Title','accent':'','subtitle':'Subtitle text','kicker':'Kicker','lead':'Lead paragraph',
  'statement':'Your statement here','quote':'A short, memorable quote','by':'Source','label':'Label',
  'desc':'Description','head':'Heading','body':'Body text','name':'Name','caption':'Caption',
  'note':'','loop':'','filename':'file.txt','code':'...','index':'01','tag':'','badge':'VS',
  'unit':'','xlabel':'','ylabel':'','html':'<h1 class="title">Raw slide</h1>','k':'Key','v':'Value',
}
def _skeleton(v, key=''):
    """Replace content strings with placeholders, keep numbers/shape."""
    if isinstance(v, str):
        return PLACEHOLDER.get(key, 'Text') if v else v
    if isinstance(v, bool) or v is None: return v
    if isinstance(v, (int, float)): return v
    if isinstance(v, list):
        out=[_skeleton(x, key.rstrip('s')) for x in v[:3]]   # keep at most 3 sample items
        return out
    if isinstance(v, dict):
        return {k:_skeleton(x, k) for k, x in v.items()}
    return v

def template_extract(html_path, pack_path):
    html=open(html_path,encoding='utf-8').read()
    m=PAT.search(html)
    if not m: sys.exit('no deck-data found in '+html_path)
    data=json.loads(m.group(2))
    pack={'packVersion':1,
          'name':(data.get('meta') or {}).get('title','template'),
          'theme':data.get('theme'),
          'defaults':data.get('defaults')}
    if data.get('brand'): pack['brand']=data['brand']
    if data.get('masters'): pack['masters']=data['masters']
    pack['skeleton']=[]
    for sl in data.get('slides',[]):
        sk={'layout':sl.get('layout'),'content':_skeleton(sl.get('content') or {},'')}
        for k in ('ambient','theme'):
            if sl.get(k) is not None: sk[k]=sl[k]
        pack['skeleton'].append(sk)
    open(pack_path,'w',encoding='utf-8').write(json.dumps(pack,indent=2,ensure_ascii=False))
    print('extracted template pack (%d slide skeletons) -> %s'%(len(pack['skeleton']),pack_path))

def template_apply(pack_path, html_path):
    pack=json.load(open(pack_path,encoding='utf-8'))
    html=open(html_path,encoding='utf-8').read()
    if not PAT.search(html): sys.exit('no deck-data found in '+html_path)
    data={'meta':{'title':pack.get('name','deck'),'schemaVersion':2},
          'theme':pack.get('theme'),
          'defaults':pack.get('defaults') or {'ambient':'auto'},
          'slides':pack.get('skeleton') or []}
    if pack.get('brand'): data['brand']=pack['brand']
    if pack.get('masters'): data['masters']=pack['masters']
    body=json.dumps(data,indent=2,ensure_ascii=False)
    new=PAT.sub(lambda m: m.group(1)+'\n'+body+'\n'+m.group(3), html, count=1)
    open(html_path,'w',encoding='utf-8').write(new)
    print('applied pack %r: %d skeleton slides -> %s'%(pack.get('name'),len(data['slides']),html_path))

def main():
    args=sys.argv[1:]
    if args[:1]==['template']:
        if len(args)==4 and args[1]=='extract': template_extract(args[2],args[3]); return
        if len(args)==4 and args[1]=='apply':   template_apply(args[2],args[3]); return
        sys.exit('usage: deckdata.py template extract deck.html pack.json | template apply pack.json deck.html')
    ap=argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['extract','inject'])
    ap.add_argument('html'); ap.add_argument('arg', nargs='?')
    a=ap.parse_args()
    if a.cmd=='extract': extract(a.html, a.arg)
    else:
        if not a.arg: sys.exit('inject needs a JSON file')
        inject(a.html, a.arg)

if __name__=='__main__': main()
