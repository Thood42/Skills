#!/usr/bin/env python3
"""
build_deck.py — assemble a complete deck from an outline, a theme, and the template.

This removes the most error-prone manual work in deck building: stamping out each
slide's markup and keeping every .pager ("04 / 12") and .progress width in sync. You
describe the deck as an outline (JSON); this emits a ready-to-render .html with the
chosen theme applied and all numbering correct.

USAGE
  python3 scripts/build_deck.py --outline deck.json --out mydeck.html
  python3 scripts/build_deck.py --outline deck.json --theme deep-ocean --out mydeck.html
  python3 scripts/build_deck.py --list-layouts
  python3 scripts/build_deck.py --sample > deck.json        # print a sample outline

OUTLINE (JSON)
  { "theme": "midnight-neon", "seed": 1,
    "slides": [ { "layout": "cover", ... }, { "layout": "stat-grid", ... }, ... ] }
  Theme name is a slug of a heading in references/themes.md (e.g. "royal-velvet").
  See --sample for one slide of every layout. Unknown fields are ignored; missing
  ones get sensible blanks, so a partial outline still builds (you fill content after).

This is a SCAFFOLDER as much as a generator: it's fine to build from a rough outline,
then hand-edit the .html for the finishing touches. Re-running build_deck.py overwrites,
so do your hand edits after the final build (or keep editing the outline).
"""
import argparse, html, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "reference-deck.html"
THEMES_MD = ROOT / "references" / "themes.md"

LAYOUTS = ["cover", "agenda", "points", "divider", "stat-grid", "bignum", "chart",
           "comparison", "quote", "code", "timeline", "pipeline", "closing"]


# ---------- helpers ----------
def esc(s):
    return html.escape(str(s), quote=False) if s is not None else ""

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def numeric(s):
    """Return a count-up target if the string is a plain/compact number, else None."""
    if s is None:
        return None
    m = re.fullmatch(r"\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([KMBT]?)\s*", str(s))
    if not m:
        return None
    val = float(m.group(1).replace(",", ""))
    mult = {"": 1, "K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[m.group(2)]
    return val * mult, m.group(2) != ""


# ---------- theme parsing (single source of truth = themes.md) ----------
def load_themes():
    if not THEMES_MD.exists():
        return {}
    text = THEMES_MD.read_text(encoding="utf-8")
    themes = {}
    # split on "## N · Name"
    for m in re.finditer(r"^##\s+\d+\s*·\s*(.+?)\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S):
        name = re.sub(r"\s*\(.*?\)\s*$", "", m.group(1)).strip()
        body = m.group(2)
        link = re.search(r"```html\s*(.*?)```", body, re.S)
        root = re.search(r"```css\s*(:root\{.*?\})\s*```", body, re.S)
        if link and root:
            themes[slug(name)] = {"name": name,
                                  "link": link.group(1).strip(),
                                  "root": root.group(1).strip()}
    return themes


def apply_theme(head, theme, seed):
    if theme:
        head = re.sub(r'<link href="https://fonts\.googleapis\.com/css2\?[^"]*" rel="stylesheet">',
                      theme["link"], head, count=1)
        head = re.sub(r":root\{.*?\}", lambda _: theme["root"], head, count=1, flags=re.S)
    if seed is not None:
        head = re.sub(r"<html lang=\"en\"[^>]*>", f'<html lang="en" data-seed="{int(seed)}">', head, count=1)
    return head


# ---------- per-layout emitters ----------
def chrome(i, total):
    pct = round(100 * i / total, 1)
    return f'    <div class="pager">{i:02d} / {total}</div><div class="progress" style="width:{pct}%"></div>'

def kicker(s):
    return f'    <div class="eyebrow-row"><span class="kicker">{esc(s)}</span></div>\n' if s else ""

def num_html(value):
    n = numeric(value)
    if n is None:
        return esc(value)
    target, compact = n
    fmt = ' data-fmt="compact"' if compact else ""
    return f'<span class="sg-count" data-to="{int(target)}" data-dur="1500"{fmt}>0</span>'

def e_cover(s):
    title = esc(s.get("title", "Title"))
    acc = s.get("accent")
    if acc:
        title = title.replace(esc(acc), f'<span class="glow sg-glow-pulse">{esc(acc)}</span>', 1)
    meta = "".join(f"<span>{esc(x)}</span>" for x in s.get("meta", []))
    return (f'    <div class="orb a"></div><div class="orb b"></div><div class="orb c"></div>\n'
            f'{kicker(s.get("kicker"))}'
            f'    <h1 class="title sg-fade-rise sg-onenter">{title}</h1>\n'
            f'    <p class="subtitle">{esc(s.get("subtitle",""))}</p>\n'
            + (f'    <div class="meta">{meta}</div>\n' if meta else ""))

def e_agenda(s):
    items = s.get("items") or [{"h": p} for p in s.get("points", [])]
    rows = ""
    for n, it in enumerate(items, 1):
        h = esc(it.get("h", it) if isinstance(it, dict) else it)
        p = esc(it.get("p", "")) if isinstance(it, dict) else ""
        rows += (f'      <div class="ag-item"><div class="ag-num">{n:02d}</div>'
                 f'<div class="ag-body"><h3>{h}</h3>{f"<p>{p}</p>" if p else ""}</div></div>\n')
    return (f'    <div class="rail"></div>\n{kicker(s.get("kicker"))}'
            f'    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="agenda-grid sg-stagger sg-onenter">\n{rows}    </div>\n')

def e_divider(s):
    return (f'    <div class="big-index">{esc(s.get("index","01"))}</div>\n'
            f'    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <p class="subtitle">{esc(s.get("subtitle",""))}</p>\n')

def e_statgrid(s):
    cells = ""
    for st in s.get("stats", [])[:4]:
        unit = f'<small>{esc(st.get("unit",""))}</small>' if st.get("unit") else ""
        cells += (f'      <div class="stat"><div class="num">{num_html(st.get("num",""))}{unit}</div>'
                  f'<div class="lbl">{esc(st.get("lbl",""))}</div></div>\n')
    return (f'{kicker(s.get("kicker"))}    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="stat-grid">\n{cells}    </div>\n')

def e_bignum(s):
    return (f'{kicker(s.get("kicker"))}'
            f'    <div class="hero-num">{num_html(s.get("num",""))}</div>\n'
            f'    <p class="subtitle">{esc(s.get("subtitle",""))}</p>\n')

def e_chart(s):
    # Charts are bespoke (slidegen.py) or Chart.js; emit a sized placeholder + guidance.
    return (f'{kicker(s.get("kicker"))}    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="chart-wrap" style="flex:1; min-height:0; display:grid; place-items:center; '
            f'border:1px dashed var(--brd-2); border-radius:12px; color:var(--faint)">\n'
            f'      <!-- TODO chart: run  python3 slidegen.py chart {esc(s.get("chart","line"))} --data spec.json\n'
            f'           and paste the fragment here, OR use Chart.js (references/charts.md). -->\n'
            f'      chart placeholder — {esc(s.get("title","data"))}\n    </div>\n')

def e_comparison(s):
    def col(side, cls):
        pts = "".join(f"<li>{esc(p)}</li>" for p in side.get("points", []))
        return (f'      <div class="cmp-col {cls}"><div class="tag">{esc(side.get("tag",""))}</div>'
                f'<h3>{esc(side.get("h",""))}</h3><ul>{pts}</ul></div>\n')
    left = s.get("left", {}); right = s.get("right", {})
    return (f'{kicker(s.get("kicker"))}    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="cmp">\n{col(left,"sup")}'
            f'      <div class="vs-rail"><div class="vs-badge">{esc(s.get("vs","VS"))}</div></div>\n'
            f'{col(right,"uns")}    </div>\n')

def e_quote(s):
    return (f'    <div class="quote-mark">&ldquo;</div>\n'
            f'    <blockquote class="sg-reveal-wipe sg-onenter">{esc(s.get("quote",""))}</blockquote>\n'
            f'    <div class="by"><div class="line"></div><span>{esc(s.get("by",""))}</span></div>\n'
            + (f'    <p class="subtitle" style="margin-top:26px">{esc(s.get("subtitle"))}</p>\n' if s.get("subtitle") else ""))

def e_code(s):
    code = esc(s.get("code", ""))
    return (f'{kicker(s.get("kicker"))}    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="code-stage"><div class="code-panel">\n'
            f'      <div class="code-bar"><span class="dotrow"><i></i><i></i><i></i></span>{esc(s.get("lang","code"))}</div>\n'
            f'      <div class="code-sweep"></div>\n<pre>{code}<span class="caret"></span></pre>\n'
            f'    </div>\n' + (f'    <p class="code-cap">{esc(s.get("caption"))}</p>\n' if s.get("caption") else "")
            + '    </div>\n')

def e_timeline(s):
    items = s.get("milestones", [])
    rows = ""
    for n, mlst in enumerate(items):
        now = " now" if n == len(items) - 1 else ""
        rows += (f'        <div class="tl-item"><div class="yr">{esc(mlst.get("yr",""))}</div>'
                 f'<div class="tl-dot{now}"></div><div class="ev"><b>{esc(mlst.get("b",""))}</b>{esc(mlst.get("ev",""))}</div></div>\n')
    return (f'{kicker(s.get("kicker"))}    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="timeline"><div class="tl-track"></div><div class="tl-spark"></div>\n'
            f'      <div class="tl-items">\n{rows}      </div>\n    </div>\n')

def e_pipeline(s):
    nodes = s.get("nodes", [])
    parts = []
    for n, nd in enumerate(nodes):
        parts.append(f'      <div class="pipe-node"><div class="ico">{esc(nd.get("ico","◉"))}</div>'
                     f'<h3>{esc(nd.get("h",""))}</h3><p>{esc(nd.get("p",""))}</p></div>')
        if n < len(nodes) - 1:
            delay = f' style="animation-delay:{n*0.6:.1f}s"' if n else ""
            parts.append(f'      <div class="pipe-conn"><div class="pipe-packet"{delay}></div></div>')
    loop = f'      <div class="pipe-loop">{esc(s.get("loop"))}</div>\n' if s.get("loop") else ""
    return (f'{kicker(s.get("kicker"))}    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="pipe">\n' + "\n".join(parts) + "\n" + loop + '    </div>\n')

def e_closing(s):
    cards = ""
    for n, t in enumerate(s.get("takeaways", []), 1):
        cards += f'      <div><div class="n">{n:02d}</div><h3>{esc(t.get("h",""))}</h3><p>{esc(t.get("p",""))}</p></div>\n'
    meta = s.get("meta", "Thank you")
    return (f'    <div class="orb b" style="opacity:.30"></div><div class="orb c"></div>\n'
            f'{kicker(s.get("kicker"))}    <h1 class="title">{esc(s.get("title",""))}</h1>\n'
            f'    <div class="take sg-stagger sg-onenter">\n{cards}    </div>\n'
            f'    <div class="meta"><svg class="sg-check sg-onenter" viewBox="0 0 52 52" width="30" height="30" '
            f'fill="none" stroke="var(--mint)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">'
            f'<circle cx="26" cy="26" r="24"/><path class="tick" d="M16 27 L23 34 L37 18"/></svg>'
            f'<span>{esc(meta)}</span></div>\n')

EMIT = {"cover": e_cover, "agenda": e_agenda, "points": e_agenda, "divider": e_divider,
        "stat-grid": e_statgrid, "bignum": e_bignum, "chart": e_chart, "comparison": e_comparison,
        "quote": e_quote, "code": e_code, "timeline": e_timeline, "pipeline": e_pipeline,
        "closing": e_closing}

SECTION_CLASS = {"cover": "cover", "divider": "divider", "bignum": "bignum",
                 "quote": "quote", "closing": "closing"}


def build_section(s, i, total):
    layout = s.get("layout", "points")
    if layout not in EMIT:
        sys.exit(f"unknown layout '{layout}' (slide {i}). See --list-layouts.")
    cls = "slide" + (f" {SECTION_CLASS[layout]}" if layout in SECTION_CLASS else "")
    inner = EMIT[layout](s)
    return (f'  <!-- {i} · {layout.upper()} -->\n'
            f'  <section class="{cls}" data-i="{i}">\n{inner}{chrome(i,total)}\n  </section>\n')


def build(outline, theme_override=None):
    template = TEMPLATE.read_text(encoding="utf-8")
    themes = load_themes()
    tname = theme_override or outline.get("theme")
    theme = themes.get(slug(tname)) if tname else None
    if tname and not theme:
        sys.exit(f"unknown theme '{tname}'. Available: {', '.join(sorted(themes))}")

    deck_open = '<div class="deck" id="deck">\n'
    close_marker = '</div>\n\n<script>\n/* ---------- navigation'
    hi = template.index(deck_open) + len(deck_open)
    ci = template.index(close_marker)
    head, tail = template[:hi], template[ci:]
    head = apply_theme(head, theme, outline.get("seed"))

    slides = outline.get("slides", [])
    total = len(slides)
    body = "\n".join(build_section(s, i, total) for i, s in enumerate(slides, 1))
    return head + "\n" + body + "\n" + tail


SAMPLE = {
  "theme": "deep-ocean", "seed": 7,
  "slides": [
    {"layout": "cover", "kicker": "Q3 Review", "title": "Scaling Without Breaking",
     "accent": "Scaling", "subtitle": "How we held p99 latency flat while traffic tripled.",
     "meta": ["Platform Team", "Q3 2026", "Confidential"]},
    {"layout": "agenda", "kicker": "Roadmap", "title": "What we'll cover",
     "items": [{"h": "The pressure", "p": "3x traffic in one quarter"},
               {"h": "What we changed", "p": "Three architectural moves"},
               {"h": "Results", "p": "Latency, cost, reliability"}]},
    {"layout": "divider", "index": "01", "title": "The Pressure", "subtitle": "Where the system started to bend."},
    {"layout": "stat-grid", "kicker": "By the numbers", "title": "The quarter in four figures",
     "stats": [{"num": "3.1", "unit": "x traffic", "lbl": "peak RPS vs last quarter"},
               {"num": "42", "unit": "% cost", "lbl": "infra spend reduction per request"},
               {"num": "99.99", "unit": "% uptime", "lbl": "up from 99.9 the prior quarter"},
               {"num": "180", "unit": "ms p99", "lbl": "held flat despite the load"}]},
    {"layout": "bignum", "kicker": "The headline", "num": "180",
     "subtitle": "milliseconds at p99 — unchanged while load tripled, because the hot path no longer touches the database."},
    {"layout": "comparison", "kicker": "The key decision", "title": "Cache-aside vs write-through",
     "left": {"tag": "Chosen", "h": "Cache-aside", "points": ["Simpler failure modes", "Tolerates cache loss", "Lower write latency"]},
     "right": {"tag": "Rejected", "h": "Write-through", "points": ["Stronger consistency", "More moving parts", "Higher write cost"]}},
    {"layout": "timeline", "kicker": "How it unfolded", "title": "The rollout",
     "milestones": [{"yr": "Jul", "b": "Read replicas", "ev": "offloaded analytics"},
                    {"yr": "Aug", "b": "Edge cache", "ev": "hot path moved off DB"},
                    {"yr": "Sep", "b": "Autoscaling", "ev": "tuned to RPS, not CPU"}]},
    {"layout": "closing", "kicker": "Takeaways", "title": "Three things to remember",
     "takeaways": [{"h": "Move reads off the DB", "p": "The cheapest query is the one you never run."},
                   {"h": "Scale on the right signal", "p": "RPS predicted load; CPU lagged it."},
                   {"h": "Simple beats clever", "p": "Cache-aside's failure modes saved us twice."}],
     "meta": "Questions welcome"}
  ]
}


def main():
    ap = argparse.ArgumentParser(description="Assemble a deck from an outline + theme.")
    ap.add_argument("--outline"); ap.add_argument("--out")
    ap.add_argument("--theme", help="override outline theme (slug from themes.md)")
    ap.add_argument("--list-layouts", action="store_true")
    ap.add_argument("--list-themes", action="store_true")
    ap.add_argument("--sample", action="store_true", help="print a sample outline JSON")
    a = ap.parse_args()

    if a.list_layouts:
        print("layouts:", ", ".join(LAYOUTS)); return
    if a.list_themes:
        print("themes:", ", ".join(sorted(load_themes()))); return
    if a.sample:
        print(json.dumps(SAMPLE, indent=2)); return
    if not a.outline or not a.out:
        ap.error("need --outline and --out (or --sample / --list-layouts)")

    outline = json.loads(Path(a.outline).read_text(encoding="utf-8"))
    deck = build(outline, a.theme)
    Path(a.out).write_text(deck, encoding="utf-8")
    print(f"Built {a.out}: {len(outline.get('slides',[]))} slides"
          + (f", theme {a.theme or outline.get('theme')}" if (a.theme or outline.get('theme')) else "")
          + ". Stage libs if used, then render.sh to inspect.")


if __name__ == "__main__":
    main()
