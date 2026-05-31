#!/usr/bin/env python3
"""
lint_deck.py — deterministic checks on a deck before you ship it.

render.sh shows you the slides; this catches the bugs that are easy to miss by eye and
boring to verify by hand. Static (no browser), so it's fast and runs anywhere.

CHECKS
  • Numbering   — every .pager reads "NN / total" with the right total and in sequence,
                  and each .progress width ≈ 100·n/total. (Pitfall: forgetting to renumber.)
  • Library refs— each lib/<name>/… referenced exists on disk, and the <meta deck-libs>
                  list matches what's actually used.
  • Local refs  — relative src/href files (images, lib) resolve next to the deck.
  • Contrast    — the active theme's text vs background meets WCAG AA (4.5:1 body, 3:1 large),
                  which matters most for the light themes.

USAGE
  python3 scripts/lint_deck.py mydeck.html
Exit code 0 = clean (warnings allowed), 1 = errors found.
"""
import argparse, re, sys
from pathlib import Path

VENDOR = Path(__file__).resolve().parent.parent / "vendor"


def hex_to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6 or not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        return None
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def luminance(rgb):
    def chan(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (chan(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def root_vars(html):
    m = re.search(r":root\{(.*?)\}", html, re.S)
    if not m:
        return {}
    out = {}
    for name, val in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(1)):
        out[name.strip()] = val.strip()
    return out


def check_numbering(html, errors, warns):
    sections = re.findall(r'<section class="slide[^"]*" data-i="(\d+)"', html)
    total = len(sections)
    if total == 0:
        errors.append("no <section class=\"slide\"> found")
        return
    pagers = re.findall(r'<div class="pager">\s*(\d+)\s*/\s*(\d+)\s*</div>', html)
    progs = re.findall(r'class="progress" style="width:\s*([\d.]+)%"', html)
    if len(pagers) != total:
        warns.append(f"{total} slides but {len(pagers)} .pager elements (some slides may lack chrome)")
    for idx, (n, t) in enumerate(pagers, 1):
        if int(t) != total:
            errors.append(f".pager {n}/{t}: total should be {total}")
        if int(n) != idx:
            errors.append(f".pager #{idx} reads {n} (out of sequence)")
    for idx, w in enumerate(progs, 1):
        want = round(100 * idx / total, 1)
        if abs(float(w) - want) > 1.0:
            errors.append(f".progress #{idx} width {w}% should be ~{want}%")
    if [int(x) for x in sections] != list(range(1, total + 1)):
        errors.append(f"data-i attributes not sequential 1..{total}: {sections}")


def _strip_comments(html):
    # remove HTML and /* */ comments so documented examples (src="lib/...") aren't counted as refs
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    html = re.sub(r"/\*.*?\*/", "", html, flags=re.S)
    return html


def check_libs(html, deck_dir, errors, warns):
    meta = re.search(r'<meta\s+name="deck-libs"\s+content="([^"]*)"', html)
    html = _strip_comments(html)
    declared = {x.strip() for x in (meta.group(1).split(",") if meta else []) if x.strip()}
    used = set()
    for ref in re.findall(r'(?:src|href)="(lib/[^"]+)"', html):
        used.add(ref.split("/")[1])
        if deck_dir and not (deck_dir / ref).exists():
            errors.append(f"missing staged lib file: {ref} (run bundle.py --mode stage)")
    # ESM/loadLib usage isn't a tag; catch SG.loadLib('name')
    for name in re.findall(r"loadLib\(['\"]([\w-]+)['\"]\)", html):
        used.add(name)
    undeclared = used - declared
    if undeclared:
        warns.append(f"libs used but not in <meta deck-libs>: {sorted(undeclared)} "
                     f"(bundle.py still finds them, but declaring is cleaner)")
    unused = declared - used
    if unused:
        warns.append(f"declared in deck-libs but not used: {sorted(unused)}")


def check_local_refs(html, deck_dir, errors, warns):
    if not deck_dir:
        return
    html = _strip_comments(html)
    for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
        if re.match(r"https?:|data:|#|mailto:", ref) or ref.startswith("lib/"):
            continue
        if not (deck_dir / ref).exists():
            warns.append(f"local ref not found next to deck: {ref}")


def check_contrast(html, warns):
    v = root_vars(html)
    bg = hex_to_rgb(v.get("--bg", "")) if v.get("--bg") else None
    if not bg:
        return
    for name, thresh, label in [("--ink", 4.5, "body/title text"), ("--muted", 4.5, "secondary text")]:
        fg = hex_to_rgb(v.get(name, "")) if v.get(name) else None
        if not fg:
            continue
        r = contrast(fg, bg)
        if r < thresh:
            warns.append(f"low contrast: {name} on --bg is {r:.1f}:1 (< {thresh}:1 for {label}); "
                         f"darken/lighten the text or background")


def main():
    ap = argparse.ArgumentParser(description="Lint a slide deck (static checks).")
    ap.add_argument("deck")
    a = ap.parse_args()
    deck = Path(a.deck)
    html = deck.read_text(encoding="utf-8")
    deck_dir = deck.parent
    errors, warns = [], []

    check_numbering(html, errors, warns)
    check_libs(html, deck_dir, errors, warns)
    check_local_refs(html, deck_dir, errors, warns)
    check_contrast(html, warns)

    for w in warns:
        print(f"  warn:  {w}")
    for e in errors:
        print(f"  ERROR: {e}")
    n_sl = len(re.findall(r'<section class="slide', html))
    if errors:
        print(f"\n{len(errors)} error(s), {len(warns)} warning(s) across {n_sl} slides.")
        sys.exit(1)
    print(f"\nClean: {n_sl} slides, {len(warns)} warning(s).")


if __name__ == "__main__":
    main()
