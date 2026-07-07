#!/usr/bin/env python3
"""Asset pipeline for the slides skill.

Inlines user-supplied icons/images/styles into a deck so the exported .html
stays a single, offline file. SVG icons are sanitized (scripts/handlers/
external refs stripped) and kept inline so they inherit theme color via
currentColor; raster images are base64-embedded; SVG images become data URIs.

Usage:
  python3 scripts/assets.py manifest                 # (re)write assets/manifest.json
  python3 scripts/assets.py build [deck.json] [--all] # print the deck-assets JSON
  python3 scripts/assets.py inject deck.html [deck.json] [--all]   # write registry into <script id="deck-assets">
Options:
  --assets DIR   assets directory (default: ./assets, or alongside the deck)
  --all          include every asset, not only those referenced by the deck
"""
import sys, os, re, json, base64, argparse

RASTER = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}

def sanitize_svg(svg: str) -> str:
    svg = re.sub(r'<\?xml.*?\?>', '', svg, flags=re.S)
    svg = re.sub(r'<!DOCTYPE.*?>', '', svg, flags=re.S)
    svg = re.sub(r'<script\b.*?</script>', '', svg, flags=re.S|re.I)
    svg = re.sub(r'<foreignObject\b.*?</foreignObject>', '', svg, flags=re.S|re.I)
    svg = re.sub(r'\son\w+\s*=\s*"[^"]*"', '', svg, flags=re.I)
    svg = re.sub(r"\son\w+\s*=\s*'[^']*'", '', svg, flags=re.I)
    svg = re.sub(r'(href|xlink:href)\s*=\s*"(?!#)[^"]*"', '', svg, flags=re.I)
    return svg.strip()

def find_icons(d):
    out={}
    p=os.path.join(d,'icons')
    if os.path.isdir(p):
        for f in sorted(os.listdir(p)):
            if f.lower().endswith('.svg'):
                out[os.path.splitext(f)[0]]=sanitize_svg(open(os.path.join(p,f),encoding='utf-8').read())
    return out

def find_images(d):
    out={}
    p=os.path.join(d,'images')
    if os.path.isdir(p):
        for f in sorted(os.listdir(p)):
            name,ext=os.path.splitext(f); ext=ext.lower(); fp=os.path.join(p,f)
            if ext=='.svg':
                svg=sanitize_svg(open(fp,encoding='utf-8').read())
                out[name]='data:image/svg+xml;utf8,'+ _urlish(svg)
            elif ext in RASTER:
                b=base64.b64encode(open(fp,'rb').read()).decode('ascii')
                out[name]='data:%s;base64,%s'%(RASTER[ext],b)
    return out

def _urlish(svg):
    # minimal encoding for an SVG data URI usable in CSS background-image / src
    return (svg.replace('"',"'").replace('#','%23').replace('\n',' ')
               .replace('<','%3C').replace('>','%3E').replace('&','%26'))

def find_styles(d):
    p=os.path.join(d,'styles')
    if os.path.isdir(p):
        css=[c for c in sorted(os.listdir(p)) if c.lower().endswith('.css')]
        if css: return open(os.path.join(p,css[0]),encoding='utf-8').read()
    return ''

def referenced(deck):
    icons,images=set(),set()
    def walk(o):
        if isinstance(o,dict):
            for k,v in o.items():
                if k in ('icon','iconAsset'):
                    icons.add(v.get('name') if isinstance(v,dict) else v)
                elif k=='image' and isinstance(v,str): images.add(v)
                else: walk(v)
        elif isinstance(o,list):
            for v in o: walk(v)
    walk(deck)
    return {i for i in icons if isinstance(i,str)}, images

def build(assets_dir, deck_path=None, include_all=False):
    icons=find_icons(assets_dir); images=find_images(assets_dir); styles=find_styles(assets_dir)
    if deck_path and not include_all:
        deck=json.load(open(deck_path,encoding='utf-8'))
        ri,rm=referenced(deck)
        icons={k:v for k,v in icons.items() if k in ri}
        images={k:v for k,v in images.items() if k in rm}
    return {'icons':icons,'images':images,'styles':styles}

def manifest(assets_dir):
    m={'icons':sorted(find_icons(assets_dir).keys()),
       'images':sorted(find_images(assets_dir).keys()),
       'styles':bool(find_styles(assets_dir))}
    open(os.path.join(assets_dir,'manifest.json'),'w',encoding='utf-8').write(json.dumps(m,indent=2))
    return m

def inject(html_path, registry):
    html=open(html_path,encoding='utf-8').read()
    payload='<script type="application/json" id="deck-assets">\n'+json.dumps(registry)+'\n</script>'
    if re.search(r'<script[^>]*id="deck-assets"[^>]*>.*?</script>', html, flags=re.S):
        html=re.sub(r'<script[^>]*id="deck-assets"[^>]*>.*?</script>', payload, html, flags=re.S)
    else:
        html=html.replace('<script type="application/json" id="deck-data">',
                          payload+'\n<script type="application/json" id="deck-data">',1)
    open(html_path,'w',encoding='utf-8').write(html)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['manifest','build','inject'])
    ap.add_argument('target', nargs='?')
    ap.add_argument('deck', nargs='?')
    ap.add_argument('--assets', default=None)
    ap.add_argument('--all', action='store_true')
    a=ap.parse_args()
    def adir(near=None):
        if a.assets: return a.assets
        if near: c=os.path.join(os.path.dirname(os.path.abspath(near)),'assets')
        else: c='assets'
        return c
    if a.cmd=='manifest':
        print(json.dumps(manifest(adir(a.target)),indent=2)); return
    if a.cmd=='build':
        reg=build(adir(a.target), a.target, a.all); print(json.dumps(reg)); return
    if a.cmd=='inject':
        html=a.target; deck=a.deck
        reg=build(adir(html), deck, a.all); inject(html, reg)
        print('injected %d icons, %d images, styles=%s into %s'%(
            len(reg['icons']),len(reg['images']),bool(reg['styles']),html)); return

if __name__=='__main__': main()
