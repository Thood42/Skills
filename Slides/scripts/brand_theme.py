#!/usr/bin/env python3
"""
brand_theme.py — derive a full deck theme from a brand's colors.

The 10 stock themes in references/themes.md cover a lot, but businesses often need their
own palette. Give this 1–3 brand hex colors and it produces a complete, contrast-checked
:root block + font <link> you can paste into a deck (or save into themes.md), in the same
variable shape the template expects.

USAGE
  python3 scripts/brand_theme.py --colors "#0A66C2" --name acme --mode dark
  python3 scripts/brand_theme.py --colors "#C8102E,#FFFFFF,#101820" --name acme --mode light
  python3 scripts/brand_theme.py --colors "#7A1FA2,#FFC400" --mode dark --fonts elegant

  --mode   dark (default) | light
  --fonts  modern (default) | elegant | editorial | warm   (display/body/mono pairings)
The first color is accent-1 (the dominant brand color); extra colors fill accent-2/-3,
otherwise they're derived by hue rotation. Output goes to stdout.
"""
import argparse, colorsys, re, sys

FONTS = {
  "modern":   ("Sora:wght@500;600;700;800", "IBM+Plex+Sans:wght@400;500;600", "JetBrains+Mono:wght@400;500;700",
               "'Sora','DejaVu Sans',system-ui,sans-serif", "'IBM Plex Sans','DejaVu Sans',system-ui,sans-serif",
               "'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace"),
  "elegant":  ("Playfair+Display:wght@500;600;700;800", "Lora:wght@400;500;600", "IBM+Plex+Mono:wght@400;500;600",
               "'Playfair Display','Georgia','DejaVu Serif',serif", "'Lora','Georgia','DejaVu Serif',serif",
               "'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace"),
  "editorial":("Newsreader:wght@400;500;600;700", "Source+Serif+4:wght@400;500;600", "IBM+Plex+Mono:wght@400;500;600",
               "'Newsreader','Georgia','DejaVu Serif',serif", "'Source Serif 4','Georgia','DejaVu Serif',serif",
               "'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace"),
  "warm":     ("Unbounded:wght@500;600;700;800", "Hanken+Grotesk:wght@400;500;600;700", "Space+Mono:wght@400;700",
               "'Unbounded','DejaVu Sans',system-ui,sans-serif", "'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif",
               "'Space Mono','DejaVu Sans Mono',ui-monospace,monospace"),
}


def hex2rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        sys.exit(f"bad hex color: #{h}")
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))

def rgb2hex(rgb):
    return "#" + "".join(f"{max(0,min(255,round(c*255))):02x}" for c in rgb)

def to_hls(rgb): return colorsys.rgb_to_hls(*rgb)            # (h, l, s)
def from_hls(h, l, s): return colorsys.hls_to_rgb(h % 1.0, max(0, min(1, l)), max(0, min(1, s)))

def lum(rgb):
    def c(x): return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (c(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = lum(a), lum(b); hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def rgba(rgb, a): return f"rgba({round(rgb[0]*255)},{round(rgb[1]*255)},{round(rgb[2]*255)},{a})"


def derive(colors, mode, fontset):
    base = [hex2rgb(c) for c in colors]
    h0, l0, s0 = to_hls(base[0])
    # accent-1 punchy enough to read on the background
    a1 = from_hls(h0, max(l0, 0.62) if mode == "dark" else min(l0, 0.45), max(s0, 0.6))
    if len(base) >= 2:
        a2 = base[1]
    else:
        a2 = from_hls(h0 + 0.08, 0.66 if mode == "dark" else 0.42, max(s0, 0.55))
    if len(base) >= 3:
        a3 = base[2]
    else:
        a3 = from_hls(h0 - 0.10, 0.70 if mode == "dark" else 0.40, max(s0 * 0.9, 0.5))

    if mode == "dark":
        bg   = from_hls(h0, 0.045, min(s0 * 0.9, 0.5))
        bg2  = from_hls(h0, 0.085, min(s0 * 0.9, 0.5))
        stage= from_hls(h0, 0.025, min(s0, 0.5))
        ink  = from_hls(h0, 0.95, 0.18)
        muted= from_hls(h0, 0.70, 0.16)
        faint= from_hls(h0, 0.46, 0.14)
        panel, panel2 = "rgba(255,255,255,.045)", "rgba(255,255,255,.07)"
        brd = "rgba(255,255,255,.10)"
        glow_a = 0.38
    else:
        bg   = from_hls(h0, 0.965, min(s0 * 0.5, 0.4))
        bg2  = from_hls(h0, 0.92, min(s0 * 0.5, 0.4))
        stage= from_hls(h0, 0.90, min(s0 * 0.5, 0.4))
        ink  = from_hls(h0, 0.12, 0.30)
        muted= from_hls(h0, 0.34, 0.22)
        faint= from_hls(h0, 0.55, 0.16)
        panel, panel2 = rgba(ink, .04), rgba(ink, .07)
        brd = rgba(ink, .14)
        glow_a = 0.18

    # enforce AA body contrast on ink, nudging lightness toward the safe end
    for _ in range(40):
        if contrast(ink, bg) >= 4.5:
            break
        hh, ll, ss = to_hls(ink)
        ink = from_hls(hh, min(1, ll + 0.03) if mode == "dark" else max(0, ll - 0.03), ss)
    for _ in range(40):
        if contrast(muted, bg) >= 3.0:
            break
        hh, ll, ss = to_hls(muted)
        muted = from_hls(hh, min(1, ll + 0.03) if mode == "dark" else max(0, ll - 0.03), ss)

    f = FONTS[fontset]
    link = (f'<link href="https://fonts.googleapis.com/css2?family={f[0]}&family={f[1]}'
            f'&family={f[2]}&display=swap" rel="stylesheet">')
    root = f""":root{{
  --bg:{rgb2hex(bg)}; --bg-2:{rgb2hex(bg2)};
  --ink:{rgb2hex(ink)}; --muted:{rgb2hex(muted)}; --faint:{rgb2hex(faint)};
  --cyan:{rgb2hex(a1)}; --indigo:{rgb2hex(a2)}; --mint:{rgb2hex(a3)};
  --panel:{panel}; --panel-2:{panel2};
  --brd:{brd}; --brd-2:{rgba(a1,.30)}; --grid:{rgba(a1,.12)};
  --glow-cyan:0 0 {18 if mode=='light' else 34}px {rgba(a1,glow_a)}; --stage:{rgb2hex(stage)}; --dot:{rgba(a1 if mode=='dark' else ink,.10)};
  --font-display:{f[3]};
  --font-body:{f[4]};
  --font-mono:{f[5]};
  --pad:70px 88px;
}}"""
    return link, root, dict(ink_contrast=contrast(ink, bg), muted_contrast=contrast(muted, bg),
                            a1=rgb2hex(a1), a2=rgb2hex(a2), a3=rgb2hex(a3))


def main():
    ap = argparse.ArgumentParser(description="Derive a deck theme from brand colors.")
    ap.add_argument("--colors", required=True, help="1-3 hex colors, comma-separated")
    ap.add_argument("--name", default="brand")
    ap.add_argument("--mode", choices=["dark", "light"], default="dark")
    ap.add_argument("--fonts", choices=list(FONTS), default="modern")
    a = ap.parse_args()
    cols = [c for c in a.colors.split(",") if c.strip()]
    if not 1 <= len(cols) <= 3:
        ap.error("provide 1 to 3 colors")
    link, root, info = derive(cols, a.mode, a.fonts)
    print(f"## {a.name} ({a.mode}) — generated from {', '.join(cols)}")
    print(f"# accents: {info['a1']} / {info['a2']} / {info['a3']}  "
          f"| ink contrast {info['ink_contrast']:.1f}:1, muted {info['muted_contrast']:.1f}:1")
    print(link)
    print(root)
    if info["ink_contrast"] < 4.5:
        print(f"# NOTE: ink contrast {info['ink_contrast']:.1f}:1 is below AA — consider a darker/lighter brand or mode.",
              file=sys.stderr)


if __name__ == "__main__":
    main()
