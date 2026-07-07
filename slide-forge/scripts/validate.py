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
 ('index-mosaic','items'):[('title','s')],
}
AMBIENTS = {'auto','none','orbs','aurora','grid','rays','grain','contours','scan','waves','glow','constellation'}
CHART_TYPES = {'bar','bar-h','stacked','line','area','pie','donut','scatter'}
OVERRIDE_KEYS = {'x','y','w','h','scale','rot','z','color','font','anim','animDelay','animTrigger','animStep','html','theme','group','hide'}
FREE_KEYS = {'id','type','x','y','w','h','rot','scale','z','text','size','color','font','anim','animDelay','animTrigger','animStep','html','theme','group'}

def typeok(v, t):
    return {'s':lambda:isinstance(v,str), 'n':lambda:isinstance(v,(int,float)) and not isinstance(v,bool),
            'b':lambda:isinstance(v,bool), 'o':lambda:isinstance(v,dict), 'a':lambda:isinstance(v,list),
            'sn':lambda:isinstance(v,(str,int,float)) and not isinstance(v,bool)}[t]()

def validate(data):
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
                for k, o in ov.items():
                    # v3: authored content-path keys ("title", "stats.2", "left.items.0");
                    # raw slides (and pre-v3 decks awaiting migration) use positional b0/b0.1
                    if not re.match(r'^(b\d+(\.\d+){0,2}|[A-Za-z][\w-]*(\.[\w-]+)*)$', k):
                        warns.append('%s: odd override key %r' % (where, k))
                    if not isinstance(o, dict): errs.append('%s: overrides[%r] not an object' % (where, k)); continue
                    for f in o:
                        if f not in OVERRIDE_KEYS: warns.append('%s: overrides[%r] unknown field %r' % (where, k, f))
        for j, fo in enumerate(sl.get('freeObjects') or []):
            if not isinstance(fo, dict) or 'id' not in fo:
                errs.append('%s: freeObjects[%d] needs an object with id' % (where, j)); continue
            for f in fo:
                if f not in FREE_KEYS: warns.append('%s: freeObjects[%d] unknown field %r' % (where, j, f))
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
    return errs, warns

def load(path):
    text = open(path, encoding='utf-8').read()
    if path.endswith(('.html', '.htm')):
        m = re.search(r'<script[^>]*type="application/json"[^>]*id="deck-data"[^>]*>(.*?)</script>', text, re.S)
        if not m: sys.exit('no <script id="deck-data"> found in ' + path)
        text = m.group(1)
    return json.loads(text)

def main():
    if len(sys.argv) != 2: sys.exit(__doc__)
    data = load(sys.argv[1])
    errs, warns = validate(data)
    for w in warns: print('WARN  ' + w)
    for e in errs: print('ERROR ' + e)
    if errs: sys.exit(1)
    print('OK — %d slides, schema v%s' % (len(data['slides']), (data.get('meta') or {}).get('schemaVersion', 1)))

if __name__ == '__main__':
    main()
