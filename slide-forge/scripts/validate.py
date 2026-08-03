#!/usr/bin/env python3
"""Validate a deck's deck-data JSON against the layout schemas (schema v2).

Replaces the old regex one-liner. Checks, per slide:
  • layout is a registered name
  • required content fields exist with the right JSON type
  • array items have their required fields
  • overrides / freeObjects / brand / masters are structurally sound
Warnings (non-fatal): unknown content keys, back-to-back layout repeats,
slide count outside 4–20.

Usage:
  python3 scripts/validate.py deck.html      # extracts deck-data first
  python3 scripts/validate.py data.json
Exit 0 = valid (warnings allowed), 1 = errors.
"""
import sys, re, json

# ---- layout schemas: {field: type} ; '?' prefix = optional ------------------
# type: s=string, n=number, b=bool, o=object, a=list, sn=string-or-number
S = {
 'cover':        {'?kicker':'s','title':'s','?accent':'s','?subtitle':'s','?meta':'a'},
 'agenda':       {'?kicker':'s','?title':'s','items':'a'},
 'divider':      {'?index':'sn','title':'s','?subtitle':'s'},
 'stat-grid':    {'?kicker':'s','?title':'s','stats':'a'},
 'bignum':       {'?kicker':'s','?count':'n','?value':'sn','?fmt':'s','?subtitle':'s'},
 'chart':        {'?kicker':'s','?title':'s','?note':'s','?body':'s','?svg':'s','?type':'s','?data':'o','?options':'o'},
 'table':        {'?kicker':'s','?title':'s','columns':'a','rows':'a','?options':'o','?note':'s'},
 'comparison':   {'?kicker':'s','?title':'s','left':'o','right':'o','?badge':'s'},
 'quote':        {'quote':'s','?by':'s','?subtitle':'s'},
 'code':         {'?kicker':'s','?title':'s','?filename':'s','code':'s','?caption':'s'},
 'timeline':     {'?kicker':'s','?title':'s','items':'a'},
 'pipeline':     {'?kicker':'s','?title':'s','nodes':'a','?loop':'s'},
 'closing':      {'?kicker':'s','title':'s','?accent':'s','takeaways':'a','?note':'s'},
 'manifesto':    {'statement':'s','?lead':'s'},
 'editorial':    {'?kicker':'s','lead':'s','columns':'a'},
 'hero-asym':    {'title':'s','?sub':'s','rows':'a'},
 'figure':       {'?kicker':'s','title':'s','?caption':'s','?image':'s'},
 'image':        {'?kicker':'s','?title':'s','?caption':'s','image':'s','?fit':'s','?focal':'a','?frame':'s'},
 'media-split':  {'?kicker':'s','title':'s','?body':'s','?items':'a','image':'s','?side':'s','?fit':'s','?focal':'a'},
 'gallery':      {'?kicker':'s','?title':'s','items':'a'},
 'diagram':      {'?kicker':'s','?title':'s','svg':'s','?caption':'s'},
 'embed':        {'?kicker':'s','?title':'s','url':'s','?ratio':'s','?mode':'s','?poster':'s','?note':'s'},
 'metric-dash':  {'?kicker':'s','?title':'s','ring':'o','tiles':'a'},
 'leaderboard':  {'?kicker':'s','?title':'s','rows':'a'},
 'diptych':      {'left':'o','right':'o'},
 'matrix':       {'?kicker':'s','?title':'s','cells':'a','?xlabel':'s','?ylabel':'s'},
 'stack':        {'?kicker':'s','?title':'s','bands':'a'},
 'quote-mosaic': {'?kicker':'s','?title':'s','quotes':'a'},
 'index-mosaic': {'?kicker':'s','?title':'s','items':'a'},
 'before-after': {'?kicker':'s','?title':'s','before':'o','after':'o'},
 'raw':          {'html':'s'},
}
ITEM = {   # required fields on each item of the named array
 ('agenda','items'):[('title','s')], ('stat-grid','stats'):[('label','s')],
 ('timeline','items'):[('year','sn'),('title','s')], ('pipeline','nodes'):[('title','s')],
 ('closing','takeaways'):[('title','s')], ('editorial','columns'):[('head','s'),('body','s')],
 ('hero-asym','rows'):[('k','s'),('v','sn')], ('metric-dash','tiles'):[('value','sn'),('label','s')],
 ('leaderboard','rows'):[('name','s'),('value','sn')], ('matrix','cells'):[('title','s')],
 ('stack','bands'):[('title','s')], ('quote-mosaic','quotes'):[('quote','s'),('by','s')],
 ('index-mosaic','items'):[('title','s')], ('gallery','items'):[('image','s')],
}
AMBIENTS = {'auto','none','orbs','aurora','grid','rays','grain','contours','scan','waves','glow','constellation'}
CHART_TYPES = {'bar','bar-h','stacked','line','area','pie','donut','scatter'}
FIT_MODES = {'cover','contain','fill'}
FRAME_MODES = {'none','panel','glow','shadow'}
EMBED_MODES = {'click','live','poster'}
EMBED_URL_RE = re.compile(r'^https?://', re.I)
OVERRIDE_KEYS = {'x','y','w','h','scale','rot','z','color','font','fs','anim','animDelay','animTrigger','animStep','html','theme','group','hide','href'}
HREF_RE = re.compile(r'^(#\d+|https?:.*|mailto:.*)$', re.I)
# media plan §3/§3.4/§5/§6: image/svg objects (asset,fit,focal,radius,opacity,
# frame,alt), a shared "href" link on any free object (§5), and embed fields
# (§6) — kept in one set since a deck author may hand-edit freeObjects JSON.
# v4 added name/hide; v5 added the content-backed object (layout,pick,content
# + its own overrides bag, keyed relative to `pick`).
FREE_KEYS = {'id','type','x','y','w','h','rot','scale','z','text','size','color','font','anim','animDelay',
 'animTrigger','animStep','html','theme','group','asset','fit','focal','radius','opacity','frame','alt','href',
 'url','ratio','mode','poster','sandbox','chrome','title','fillPrev','name','hide','fs',
 'layout','pick','content','overrides'}
OVERRIDE_KEY_RE = re.compile(r'^(b\d+(\.\d+){0,2}|[A-Za-z][\w-]*(\.[\w-]+)*)$')

def _check_overrides(ov, where, label, errs, warns):
    """One override bag — a slide's, or a content-backed free object's own
    (whose keys are relative to its `pick`, so the same rules apply)."""
    for k, o in ov.items():
        # v3: authored content-path keys ("title", "stats.2", "left.items.0");
        # raw slides (and pre-v3 decks awaiting migration) use positional b0/b0.1
        if not OVERRIDE_KEY_RE.match(k):
            warns.append('%s: odd %s key %r' % (where, label, k))
        if not isinstance(o, dict):
            errs.append('%s: %s[%r] not an object' % (where, label, k)); continue
        for f in o:
            if f not in OVERRIDE_KEYS:
                warns.append('%s: %s[%r] unknown field %r' % (where, label, k, f))
        if o.get('href') and not HREF_RE.match(o['href']):
            errs.append('%s: %s[%r].href %r is not https:/mailto:/#N (media plan section 5 allow-list)'
                        % (where, label, k, o['href']))

def typeok(v, t):
    return {'s':lambda:isinstance(v,str), 'n':lambda:isinstance(v,(int,float)) and not isinstance(v,bool),
            'b':lambda:isinstance(v,bool), 'o':lambda:isinstance(v,dict), 'a':lambda:isinstance(v,list),
            'sn':lambda:isinstance(v,(str,int,float)) and not isinstance(v,bool)}[t]()

def _asset_refs(data):
    """Every place an asset NAME can appear — kept in lockstep (by convention,
    same key names) with src/media.js's F.assets.refs() and scripts/assets.py's
    referenced(). Returns [(where, kind, name), ...]."""
    out = []
    def walk(o, where):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ('image', 'poster', 'logo') and isinstance(v, str) and v:
                    out.append((where, 'images', v))
                elif k == 'svg' and isinstance(v, str) and v:
                    out.append((where, 'svg', v))
                elif k == 'asset' and isinstance(v, str) and v:
                    out.append((where, 'svg' if o.get('type') == 'svg' else 'images', v))
                else:
                    walk(v, where)
        elif isinstance(o, list):
            for v in o: walk(v, where)
    for i, sl in enumerate(data.get('slides') or []):
        walk(sl, 'slide %d' % (i + 1))
    return out

def validate(data, assets=None):
    errs, warns = [], []
    if not isinstance(data, dict): return ['deck-data root is not an object'], []
    slides = data.get('slides')
    if not isinstance(slides, list) or not slides:
        return ['deck has no slides[]'], []
    if not (4 <= len(slides) <= 20):
        warns.append('slide count %d outside the usual 4-20' % len(slides))
    prev = None
    for i, sl in enumerate(slides):
        where = 'slide %d' % (i+1)
        lay = sl.get('layout')
        if lay not in S:
            errs.append('%s: unknown layout %r' % (where, lay)); continue
        if lay == prev and lay not in ('divider','raw'):
            warns.append('%s: layout %r repeats back-to-back' % (where, lay))
        prev = lay
        c = sl.get('content')
        if not isinstance(c, dict):
            errs.append('%s: missing content object' % where); continue
        schema = S[lay]
        known = {k.lstrip('?') for k in schema}
        for k, t in schema.items():
            opt, name = k.startswith('?'), k.lstrip('?')
            if name not in c:
                if not opt: errs.append('%s (%s): missing required field %r' % (where, lay, name))
                continue
            if not typeok(c[name], t):
                errs.append('%s (%s): field %r should be %s' % (where, lay, name, t))
        for k in c:
            if k not in known: warns.append('%s (%s): unknown content key %r' % (where, lay, k))
        for (l, arr), reqs in ITEM.items():
            if l != lay or arr not in c or not isinstance(c[arr], list): continue
            for j, it in enumerate(c[arr]):
                if not isinstance(it, dict):
                    errs.append('%s (%s): %s[%d] is not an object' % (where, lay, arr, j)); continue
                for (fk, ft) in reqs:
                    if fk not in it: errs.append('%s (%s): %s[%d] missing %r' % (where, lay, arr, j, fk))
                    elif not typeok(it[fk], ft): errs.append('%s (%s): %s[%d].%s should be %s' % (where, lay, arr, j, fk, ft))
        if lay == 'chart' and isinstance(c.get('data'), dict):
            d = c['data']; labels = d.get('labels'); series = d.get('series')
            if not isinstance(labels, list) or not labels:
                errs.append('%s (chart): data.labels must be a non-empty list' % where)
            if not isinstance(series, list) or not series:
                errs.append('%s (chart): data.series must be a non-empty list' % where)
            if isinstance(labels, list) and isinstance(series, list):
                for j, srs in enumerate(series):
                    if not isinstance(srs, dict) or not isinstance(srs.get('values'), list):
                        errs.append('%s (chart): series[%d] needs a values list' % (where, j))
                    elif len(srs['values']) != len(labels):
                        errs.append('%s (chart): series[%d] has %d values for %d labels'
                                    % (where, j, len(srs['values']), len(labels)))
                    elif not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in srs['values']):
                        errs.append('%s (chart): series[%d].values must all be numbers' % (where, j))
            ct = c.get('type', 'bar')
            if ct not in CHART_TYPES:
                errs.append('%s (chart): unknown type %r (one of %s)' % (where, ct, sorted(CHART_TYPES)))
        elif lay == 'chart' and not (c.get('data') or c.get('svg') or c.get('body')):
            warns.append('%s (chart): no data and no svg/body escape hatch - renders empty' % where)
        if lay == 'embed':
            if isinstance(c.get('url'), str) and c['url'] and not EMBED_URL_RE.match(c['url']):
                errs.append('%s (embed): url %r must be http:// or https:// (media plan section 6.3)' % (where, c['url']))
            if 'mode' in c and c['mode'] not in EMBED_MODES:
                errs.append('%s (embed): mode %r not one of %s' % (where, c['mode'], sorted(EMBED_MODES)))
        if lay in ('image', 'media-split') or lay == 'gallery':
            items = c.get('items') if lay == 'gallery' else [c]
            for it in (items or []):
                if not isinstance(it, dict): continue
                if 'fit' in it and it['fit'] not in FIT_MODES:
                    errs.append('%s (%s): fit %r not one of %s' % (where, lay, it['fit'], sorted(FIT_MODES)))
                if 'frame' in it and it['frame'] not in FRAME_MODES:
                    errs.append('%s (%s): frame %r not one of %s' % (where, lay, it['frame'], sorted(FRAME_MODES)))
        if lay == 'table':
            ncol = len(c.get('columns') or [])
            for j, r in enumerate(c.get('rows') or []):
                if not isinstance(r, list):
                    errs.append('%s (table): rows[%d] is not a list' % (where, j))
                elif len(r) != ncol:
                    warns.append('%s (table): rows[%d] has %d cells for %d columns' % (where, j, len(r), ncol))
        amb = sl.get('ambient')
        if amb is not None and amb not in AMBIENTS:
            errs.append('%s: unknown ambient %r' % (where, amb))
        ov = sl.get('overrides')
        if ov is not None:
            if not isinstance(ov, dict): errs.append('%s: overrides is not an object' % where)
            else:
                _check_overrides(ov, where, 'overrides', errs, warns)
        for j, fo in enumerate(sl.get('freeObjects') or []):
            if not isinstance(fo, dict) or 'id' not in fo:
                errs.append('%s: freeObjects[%d] needs an object with id' % (where, j)); continue
            for f in fo:
                if f not in FREE_KEYS: warns.append('%s: freeObjects[%d] unknown field %r' % (where, j, f))
            if fo.get('href') and not HREF_RE.match(fo['href']):
                errs.append('%s: freeObjects[%d].href %r is not https:/mailto:/#N (media plan section 5 allow-list)' % (where, j, fo['href']))
            if fo.get('fit') is not None and fo['fit'] not in FIT_MODES:
                errs.append('%s: freeObjects[%d].fit %r not one of %s' % (where, j, fo['fit'], sorted(FIT_MODES)))
            if fo.get('frame') is not None and fo['frame'] not in FRAME_MODES:
                errs.append('%s: freeObjects[%d].frame %r not one of %s' % (where, j, fo['frame'], sorted(FRAME_MODES)))
            if fo.get('type') in ('image', 'svg') and not (fo.get('alt') or '').strip():
                warns.append('%s: freeObjects[%d] (%s) has no alt text' % (where, j, fo['type']))
            if fo.get('type') == 'embed':
                if isinstance(fo.get('url'), str) and fo['url'] and not EMBED_URL_RE.match(fo['url']):
                    errs.append('%s: freeObjects[%d].url %r must be http:// or https://' % (where, j, fo['url']))
                if fo.get('mode') is not None and fo['mode'] not in EMBED_MODES:
                    errs.append('%s: freeObjects[%d].mode %r not one of %s' % (where, j, fo['mode'], sorted(EMBED_MODES)))
            # v5 content-backed object: it re-renders `layout` against its own
            # `content` and mounts the subtree at `pick`, so all three must be
            # present and the layout must be one this engine can render.
            if fo.get('type') == 'node':
                fw = '%s: freeObjects[%d]' % (where, j)
                nlay = fo.get('layout')
                if nlay not in S:
                    errs.append('%s.layout %r is not a known layout' % (fw, nlay))
                elif nlay == 'raw':
                    errs.append('%s.layout cannot be "raw" (nothing keyed to pick from)' % fw)
                if not isinstance(fo.get('pick'), str) or not fo['pick']:
                    errs.append('%s.pick must be the content-path key of the element to mount' % fw)
                elif not OVERRIDE_KEY_RE.match(fo['pick']):
                    warns.append('%s.pick %r is not a content-path key' % (fw, fo['pick']))
                nc = fo.get('content')
                if not isinstance(nc, dict):
                    errs.append('%s.content must be an object (the data it re-renders from)' % fw)
                elif nlay in S:
                    # the object carries the whole layout's content, so the same
                    # required/unknown-key rules apply as to a slide of that layout
                    nknown = {k.lstrip('?') for k in S[nlay]}
                    for k, t in S[nlay].items():
                        name = k.lstrip('?')
                        if name not in nc:
                            if not k.startswith('?'):
                                errs.append('%s (%s): missing required field %r' % (fw, nlay, name))
                        elif not typeok(nc[name], t):
                            errs.append('%s (%s): field %r should be %s' % (fw, nlay, name, t))
                    for k in nc:
                        if k not in nknown:
                            warns.append('%s (%s): unknown content key %r' % (fw, nlay, k))
                fov = fo.get('overrides')
                if fov is not None:
                    if not isinstance(fov, dict):
                        errs.append('%s.overrides is not an object' % fw)
                    else:
                        _check_overrides(fov, fw, 'overrides', errs, warns)
    b = data.get('brand')
    if b is not None:
        if not isinstance(b, dict): errs.append('brand must be an object')
        else:
            for k in b:
                if k not in ('name','logo','colors','fonts'): warns.append('brand: unknown key %r' % k)
            if 'colors' in b and not isinstance(b['colors'], dict): errs.append('brand.colors must be an object')
            if 'fonts' in b and not isinstance(b['fonts'], dict): errs.append('brand.fonts must be an object')
    ms = data.get('masters')
    if ms is not None:
        if not isinstance(ms, dict): errs.append('masters must be an object')
        else:
            for name, m in ms.items():
                if not isinstance(m, dict) or 'base' not in m:
                    errs.append('masters[%r] needs {base: <layout>}' % name)
                elif m['base'] not in S:
                    errs.append('masters[%r].base %r is not a layout' % (name, m['base']))
    theme = data.get('theme')
    if theme is not None and not isinstance(theme, (str, dict)):
        errs.append('theme must be a string name or a {--var: value} object')
    v = (data.get('meta') or {}).get('schemaVersion')
    if v is not None and v not in (1, 2, 3):
        errs.append('unknown meta.schemaVersion %r' % v)
    # asset-existence + alt-text (only possible with the registry alongside the
    # data, i.e. validating a .html — a bare deck.json can't know what's been
    # imported, so this pass is skipped there rather than false-erroring)
    if assets is not None:
        images = assets.get('images') or {}
        svgs = assets.get('svg') or {}
        for where, kind, name in _asset_refs(data):
            reg = images if kind == 'images' else svgs
            if name not in reg:
                errs.append('%s: references %s asset %r, not found in the registry' % (where, kind[:-1] if kind == 'images' else kind, name))
        for name, entry in images.items():
            if isinstance(entry, dict) and not (entry.get('alt') or '').strip():
                warns.append('asset %r has no alt text' % name)
            if isinstance(entry, dict) and entry.get('store') == 'linked' and not entry.get('path'):
                errs.append('asset %r is store:"linked" but has no path' % name)
    return errs, warns

def load(path):
    """Returns (data, assets). assets is None for a bare deck.json — there's
    no registry to check references against outside a built .html."""
    text = open(path, encoding='utf-8').read()
    assets = None
    if path.endswith(('.html', '.htm')):
        m = re.search(r'<script[^>]*type="application/json"[^>]*id="deck-data"[^>]*>(.*?)</script>', text, re.S)
        if not m: sys.exit('no <script id="deck-data"> found in ' + path)
        am = re.search(r'<script[^>]*type="application/json"[^>]*id="deck-assets"[^>]*>(.*?)</script>', text, re.S)
        if am:
            try: assets = json.loads(am.group(1))
            except Exception: assets = None
        text = m.group(1)
    return json.loads(text), assets

def main():
    if len(sys.argv) != 2: sys.exit(__doc__)
    data, assets = load(sys.argv[1])
    errs, warns = validate(data, assets)
    for w in warns: print('WARN  ' + w)
    for e in errs: print('ERROR ' + e)
    if errs: sys.exit(1)
    print('OK — %d slides, schema v%s' % (len(data['slides']), (data.get('meta') or {}).get('schemaVersion', 1)))

if __name__ == '__main__':
    main()
