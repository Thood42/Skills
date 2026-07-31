#!/usr/bin/env python3
"""Asset pipeline for the slides skill.

Inlines user-supplied icons/images/diagrams/styles into a deck so the exported
.html stays a single, offline file. SVG icons and diagrams are sanitized
(scripts/handlers/external refs stripped) and kept inline so they inherit
theme color via currentColor; raster images are base64-embedded.

Registry shape (v2, media plan §2.1): each images[name] entry is an object
  {"store":"embedded","src":"data:...","w":W,"h":H,"bytes":N,"type":MIME,"alt":""}
by default, or {"store":"linked","path":"assets/images/<file>",...} when
--link-over is used. Pass --legacy to emit the old plain-string shape
(engine.js accepts all three shapes forever, so --legacy is not required for
compatibility — it's only for decks that must stay readable by very old
tooling). "svg" is a NEW sibling bucket (assets/diagrams/*.svg) for inline
diagram markup, kept apart from "icons" (small/monochrome/currentColor).

By design there is NO size ceiling on embedded assets: user-supplied imagery
present at generation time always ships inside the .html, even if that pushes
the deck to many MB — see media plan §7.3. --link-over is opt-in for people
who would rather ship deck.html + an assets/ folder side by side.

Usage:
  python3 scripts/assets.py manifest                 # (re)write assets/manifest.json
  python3 scripts/assets.py build [deck.json] [--all] # print the deck-assets JSON
  python3 scripts/assets.py inject deck.html [deck.json] [--all]   # write registry into <script id="deck-assets">
Options:
  --assets DIR     assets directory (default: ./assets, or alongside the deck)
  --all            include every asset, not only those referenced by the deck
  --legacy         emit images as plain src strings (pre-v2 shape)
  --link-over N    images/diagrams over N megabytes become store:"linked"
                   (path relative to the assets dir) instead of embedded
"""
import sys, os, re, json, base64, struct, argparse

RASTER = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}

def sanitize_svg(svg: str) -> str:
    svg = re.sub(r'<\?xml.*?\?>', '', svg, flags=re.S)
    svg = re.sub(r'<!DOCTYPE.*?>', '', svg, flags=re.S)
    svg = re.sub(r'<script\b.*?</script>', '', svg, flags=re.S|re.I)
    svg = re.sub(r'<foreignObject\b.*?</foreignObject>', '', svg, flags=re.S|re.I)
    svg = re.sub(r'\son\w+\s*=\s*"[^"]*"', '', svg, flags=re.I)
    svg = re.sub(r"\son\w+\s*=\s*'[^']*'", '', svg, flags=re.I)
    svg = re.sub(r'(href|xlink:href)\s*=\s*"(?!#)[^"]*"', '', svg, flags=re.I)
    svg = re.sub(r"(href|xlink:href)\s*=\s*'(?!#)[^']*'", '', svg, flags=re.I)
    return svg.strip()

def _urlish(svg):
    # minimal encoding for an SVG data URI usable in CSS background-image / src
    return (svg.replace('"',"'").replace('#','%23').replace('\n',' ')
               .replace('<','%3C').replace('>','%3E').replace('&','%26'))

# ---- dimension sniffing (no PIL dependency): PNG/JPEG/GIF/WEBP headers ----
def _png_dims(head):
    if head[:8]==b'\x89PNG\r\n\x1a\n' and len(head)>=24:
        w,h = struct.unpack('>II', head[16:24]); return w,h
    return 0,0

def _gif_dims(head):
    if head[:6] in (b'GIF87a', b'GIF89a') and len(head)>=10:
        w,h = struct.unpack('<HH', head[6:10]); return w,h
    return 0,0

def _webp_dims(path, head):
    if head[:4]!=b'RIFF' or head[8:12]!=b'WEBP': return 0,0
    chunk = head[12:16]
    try:
        if chunk==b'VP8X' and len(head)>=30:
            w = 1 + (head[24] | (head[25]<<8) | (head[26]<<16))
            h = 1 + (head[27] | (head[28]<<8) | (head[29]<<16))
            return w,h
        with open(path,'rb') as f: data=f.read(34)
        if chunk==b'VP8 ' and len(data)>=30:
            w = struct.unpack('<H', data[26:28])[0] & 0x3fff
            h = struct.unpack('<H', data[28:30])[0] & 0x3fff
            return w,h
        if chunk==b'VP8L' and len(data)>=25:
            b0,b1,b2,b3 = data[21],data[22],data[23],data[24]
            val = b0 | (b1<<8) | (b2<<16) | (b3<<24)
            w = (val & 0x3FFF) + 1; h = ((val >> 14) & 0x3FFF) + 1
            return w,h
    except Exception:
        pass
    return 0,0

def _jpeg_dims(path):
    try:
        with open(path,'rb') as f:
            f.read(2)
            while True:
                marker = f.read(2)
                if len(marker) < 2 or marker[0] != 0xFF: break
                if marker[1] in (0xD8, 0x01) or 0xD0 <= marker[1] <= 0xD7: continue
                if marker[1] == 0xDA: break
                seg_len = struct.unpack('>H', f.read(2))[0]
                if marker[1] in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF):
                    data = f.read(5)
                    h = struct.unpack('>H', data[1:3])[0]; w = struct.unpack('>H', data[3:5])[0]
                    return w,h
                f.seek(seg_len-2, 1)
    except Exception:
        pass
    return 0,0

def image_dimensions(path, ext):
    try:
        with open(path,'rb') as f: head=f.read(64)
    except Exception:
        return 0,0
    if ext=='.png': return _png_dims(head)
    if ext=='.gif': return _gif_dims(head)
    if ext=='.webp': return _webp_dims(path, head)
    if ext in ('.jpg','.jpeg'): return _jpeg_dims(path)
    return 0,0

def find_icons(d):
    out={}
    p=os.path.join(d,'icons')
    if os.path.isdir(p):
        for f in sorted(os.listdir(p)):
            if f.lower().endswith('.svg'):
                out[os.path.splitext(f)[0]]=sanitize_svg(open(os.path.join(p,f),encoding='utf-8').read())
    return out

def find_diagrams(d):
    """assets/diagrams/*.svg -> the NEW `svg` registry bucket (media plan §2.1)."""
    out={}
    p=os.path.join(d,'diagrams')
    if os.path.isdir(p):
        for f in sorted(os.listdir(p)):
            if f.lower().endswith('.svg'):
                out[os.path.splitext(f)[0]]=sanitize_svg(open(os.path.join(p,f),encoding='utf-8').read())
    return out

def _image_entry(fp, ext, legacy, link_over_bytes, rel_dir):
    fname = os.path.basename(fp)
    if ext=='.svg':
        svg = sanitize_svg(open(fp,encoding='utf-8').read())
        src = 'data:image/svg+xml;utf8,' + _urlish(svg)
        bytes_ = len(svg.encode('utf-8')); w=h=0; mime='image/svg+xml'
    else:
        raw = open(fp,'rb').read()
        bytes_ = len(raw); mime = RASTER[ext]
        w,h = image_dimensions(fp, ext)
        src = 'data:%s;base64,%s' % (mime, base64.b64encode(raw).decode('ascii'))
    if legacy:
        return src
    if link_over_bytes is not None and bytes_ > link_over_bytes:
        return {'store':'linked','path':rel_dir+'/'+fname,'w':w,'h':h,'bytes':bytes_,'type':mime,'alt':''}
    return {'store':'embedded','src':src,'w':w,'h':h,'bytes':bytes_,'type':mime,'alt':''}

def find_images(d, legacy=False, link_over_mb=None):
    out={}
    p=os.path.join(d,'images')
    link_over_bytes = None if link_over_mb is None else int(link_over_mb*1024*1024)
    if os.path.isdir(p):
        for f in sorted(os.listdir(p)):
            name,ext=os.path.splitext(f); ext=ext.lower()
            if ext=='.svg' or ext in RASTER:
                out[name]=_image_entry(os.path.join(p,f), ext, legacy, link_over_bytes, 'assets/images')
    return out

def find_styles(d):
    p=os.path.join(d,'styles')
    if os.path.isdir(p):
        css=[c for c in sorted(os.listdir(p)) if c.lower().endswith('.css')]
        if css: return open(os.path.join(p,css[0]),encoding='utf-8').read()
    return ''

def referenced(deck):
    """Every key shape that can carry an asset NAME. Kept in lockstep (by
    convention, same key names) with src/media.js's F.assets.refs() in the
    browser — see media plan §2/§C. icon/iconAsset -> icons; image/poster/
    logo -> images; svg (diagram layout content, a NAME not markup) -> svg
    bucket; free-object {type,asset} -> images or svg depending on type."""
    icons, images, svgs = set(), set(), set()
    def walk(o):
        if isinstance(o,dict):
            for k,v in o.items():
                if k in ('icon','iconAsset'):
                    icons.add(v.get('name') if isinstance(v,dict) else v)
                elif k in ('image','poster','logo') and isinstance(v,str):
                    images.add(v)
                elif k=='svg' and isinstance(v,str):
                    svgs.add(v)
                elif k=='asset' and isinstance(v,str):
                    (svgs if o.get('type')=='svg' else images).add(v)
                else:
                    walk(v)
        elif isinstance(o,list):
            for v in o: walk(v)
    walk(deck)
    return ({i for i in icons if isinstance(i,str)}, images, svgs)

def build(assets_dir, deck_path=None, include_all=False, legacy=False, link_over_mb=None):
    icons=find_icons(assets_dir); images=find_images(assets_dir, legacy, link_over_mb)
    svg=find_diagrams(assets_dir); styles=find_styles(assets_dir)
    if deck_path and not include_all:
        deck=json.load(open(deck_path,encoding='utf-8'))
        ri,rm,rs=referenced(deck)
        icons={k:v for k,v in icons.items() if k in ri}
        images={k:v for k,v in images.items() if k in rm}
        svg={k:v for k,v in svg.items() if k in rs}
    return {'icons':icons,'images':images,'svg':svg,'styles':styles}

def manifest(assets_dir):
    m={'icons':sorted(find_icons(assets_dir).keys()),
       'images':sorted(find_images(assets_dir).keys()),
       'svg':sorted(find_diagrams(assets_dir).keys()),
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
    ap.add_argument('--legacy', action='store_true', help='emit images as plain src strings (pre-v2 shape)')
    ap.add_argument('--link-over', type=float, default=None, metavar='MB',
                     help='images/diagrams over N megabytes become store:"linked" instead of embedded')
    a=ap.parse_args()
    def adir(near=None):
        if a.assets: return a.assets
        if near: c=os.path.join(os.path.dirname(os.path.abspath(near)),'assets')
        else: c='assets'
        return c
    if a.cmd=='manifest':
        print(json.dumps(manifest(adir(a.target)),indent=2)); return
    if a.cmd=='build':
        reg=build(adir(a.target), a.target, a.all, a.legacy, a.link_over); print(json.dumps(reg)); return
    if a.cmd=='inject':
        html=a.target; deck=a.deck
        reg=build(adir(html), deck, a.all, a.legacy, a.link_over); inject(html, reg)
        linked = sum(1 for v in reg['images'].values() if isinstance(v,dict) and v.get('store')=='linked')
        print('injected %d icons, %d images (%d linked), %d diagrams, styles=%s into %s'%(
            len(reg['icons']),len(reg['images']),linked,len(reg['svg']),bool(reg['styles']),html)); return

if __name__=='__main__': main()
