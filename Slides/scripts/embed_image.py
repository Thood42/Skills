#!/usr/bin/env python3
"""
embed_image.py — turn an image into a self-contained, offline-safe <img> tag.

Decks render and self-inspect offline, so an <img src="photo.png"> pointing at a remote
URL (or even a sibling file you forget to ship) shows up blank in the PNG render and may
break a single-file bundle. This base64-embeds the image directly into the markup as a
data: URI, so it travels inside the .html and always renders.

USAGE
  python3 scripts/embed_image.py logo.png                       # print an <img> tag
  python3 scripts/embed_image.py hero.jpg --max-width 1200      # downscale first (smaller deck)
  python3 scripts/embed_image.py diagram.png --class hero --alt "System diagram"

Large images bloat the .html — use --max-width to cap dimensions (slides are 1280x720, so
a full-bleed image rarely needs to exceed ~1280px). Prefer SVG icons (references/icons.md)
for iconography; use this for photos, logos, and AI-generated raster images.
"""
import argparse, base64, mimetypes, sys
from pathlib import Path

RASTER = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml"}


def downscale(path, max_w):
    try:
        from PIL import Image
    except ImportError:
        sys.exit("--max-width needs Pillow (pip install pillow).")
    import io
    im = Image.open(path)
    if im.width <= max_w:
        data = path.read_bytes()
        return data, RASTER.get(path.suffix.lower(), "image/png")
    h = round(im.height * max_w / im.width)
    im = im.convert("RGBA") if im.mode in ("P", "LA") else im
    im = im.resize((max_w, h))
    buf = io.BytesIO()
    fmt = "PNG" if path.suffix.lower() == ".png" else "JPEG"
    if fmt == "JPEG" and im.mode == "RGBA":
        im = im.convert("RGB")
    im.save(buf, fmt)
    return buf.getvalue(), ("image/png" if fmt == "PNG" else "image/jpeg")


def main():
    ap = argparse.ArgumentParser(description="Base64-embed an image as an <img> tag.")
    ap.add_argument("image")
    ap.add_argument("--max-width", type=int, help="downscale to this width (px) first")
    ap.add_argument("--class", dest="cls", default="", help="CSS class for the <img>")
    ap.add_argument("--alt", default="", help="alt text")
    ap.add_argument("--style", default="", help="inline style (e.g. 'max-width:60%')")
    a = ap.parse_args()

    p = Path(a.image)
    if not p.exists():
        sys.exit(f"not found: {p}")
    if p.suffix.lower() == ".svg":
        # SVG is text — inline it directly is even better, but a data URI works too
        data = p.read_bytes(); mime = "image/svg+xml"
    elif a.max_width:
        data, mime = downscale(p, a.max_width)
    else:
        data = p.read_bytes()
        mime = RASTER.get(p.suffix.lower()) or mimetypes.guess_type(str(p))[0] or "image/png"

    b64 = base64.b64encode(data).decode("ascii")
    attrs = ""
    if a.cls:   attrs += f' class="{a.cls}"'
    if a.alt:   attrs += f' alt="{a.alt}"'
    if a.style: attrs += f' style="{a.style}"'
    kb = len(b64) / 1024
    print(f'<img{attrs} src="data:{mime};base64,{b64}">')
    print(f"\n# embedded {p.name}: ~{kb:.0f} KB of base64"
          + (f" (downscaled to {a.max_width}px wide)" if a.max_width else ""), file=sys.stderr)


if __name__ == "__main__":
    main()
