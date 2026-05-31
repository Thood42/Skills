#!/usr/bin/env python3
"""
bundle.py — assemble a deck for delivery, pulling in only the vendored libraries
it actually uses. Three modes:

  stage   Copy referenced libs into ./lib/ NEXT TO the deck, in place. Run this
          before render.sh / previewing so file:// can load them.  (default)
  folder  Write a clean bundle dir: out/<deck>.html + out/lib/<only used libs>.
          Portable as a zip; easy to keep editing.
  single  Inline everything into ONE portable .html: each local <script src>/<link>
          is read from vendor/ and embedded; KaTeX-style fonts are base64'd into the
          CSS. ES-module libs (Three.js) can't be inlined, so they're copied beside
          the file and the deck still loads them locally.

USAGE
  python3 scripts/bundle.py deck.html                 # stage ./lib next to deck
  python3 scripts/bundle.py deck.html --mode folder --out dist/
  python3 scripts/bundle.py deck.html --mode single  --out dist/deck.bundle.html

WHICH LIBS?
  The union of (a) the <meta name="deck-libs" content="a,b"> list and (b) any
  "lib/<name>/..." paths found in the HTML. Anything not referenced is skipped,
  so a chart-only deck never carries Three.js.
"""
import argparse, base64, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"
MIME = {".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
        ".otf": "font/otf", ".eot": "application/vnd.ms-fontobject"}

SCRIPT_SRC = re.compile(r'<script\b[^>]*\bsrc=["\'](lib/[^"\']+)["\'][^>]*>\s*</script>', re.I)
LINK_HREF  = re.compile(r'<link\b[^>]*\bhref=["\'](lib/[^"\']+\.css)["\'][^>]*>', re.I)
META_LIBS  = re.compile(r'<meta\s+name=["\']deck-libs["\']\s+content=["\']([^"\']*)["\']', re.I)


def load_manifest():
    return json.loads((VENDOR / "manifest.json").read_text(encoding="utf-8"))


def find_spec(manifest, name):
    for g in ("core", "lazy"):
        s = manifest.get(g, {}).get(name)
        if s:
            return s
    return None


def referenced_libs(html, manifest):
    names = set()
    m = META_LIBS.search(html)
    if m:
        names |= {n.strip() for n in m.group(1).split(",") if n.strip()}
    for path in SCRIPT_SRC.findall(html) + LINK_HREF.findall(html):
        names.add(path.split("/")[1])              # lib/<name>/file
    # validate against manifest
    unknown = [n for n in names if not find_spec(manifest, n)]
    if unknown:
        print(f"WARNING: deck references libs not in manifest: {unknown}", file=sys.stderr)
    return sorted(n for n in names if find_spec(manifest, n))


def ensure_present(name, spec):
    missing = [f for f in spec["files"] if not (VENDOR / name / f).exists()]
    if missing:
        sys.exit(f"ERROR: vendor/{name} missing {missing}. Run: python3 scripts/libfetch.py {name}")


def copy_lib(name, spec, dest_lib):
    """Copy the whole vendored lib dir (files + any fonts/) into dest_lib/<name>/."""
    src = VENDOR / name
    dst = dest_lib / name
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def embed_css_fonts(css_text, css_vendor_dir):
    """Replace url(fonts/x.woff2) with base64 data: URIs so the CSS is self-contained."""
    def repl(m):
        raw = m.group(1).strip().strip('\'"')
        if raw.startswith("data:"):
            return m.group(0)
        rel = raw.split("?")[0].split("#")[0]
        fpath = css_vendor_dir / rel
        if not fpath.exists():
            return m.group(0)
        mime = MIME.get(fpath.suffix.lower(), "application/octet-stream")
        b64 = base64.b64encode(fpath.read_bytes()).decode("ascii")
        return f'url(data:{mime};base64,{b64})'
    return re.sub(r'url\(([^)]+)\)', repl, css_text)


def mode_stage(deck, html, manifest, libs):
    lib_dir = deck.parent / "lib"
    lib_dir.mkdir(exist_ok=True)
    for name in libs:
        spec = find_spec(manifest, name); ensure_present(name, spec)
        copy_lib(name, spec, lib_dir)
    print(f"Staged {len(libs)} lib(s) into {lib_dir}/ : {', '.join(libs) or '(none)'}")
    print("You can now render/preview the deck in place.")


def mode_folder(deck, html, manifest, libs, out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    (out / deck.name).write_text(html, encoding="utf-8")
    if libs:
        lib_dir = out / "lib"; lib_dir.mkdir(exist_ok=True)
        for name in libs:
            spec = find_spec(manifest, name); ensure_present(name, spec)
            copy_lib(name, spec, lib_dir)
    print(f"Folder bundle -> {out}/  (deck + lib/: {', '.join(libs) or 'none'})")


def mode_single(deck, html, manifest, libs, out):
    out = Path(out)
    if out.is_dir() or str(out).endswith("/"):
        out = out / (deck.stem + ".bundle.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    sidecar = []

    # Inline <script src="lib/...">  (UMD libs)
    def repl_script(m):
        rel = m.group(1)
        f = VENDOR / rel[len("lib/"):]
        if not f.exists():
            sys.exit(f"ERROR: {f} missing — run libfetch for that lib.")
        return "<script>\n" + f.read_text(encoding="utf-8", errors="replace") + "\n</script>"
    html2 = SCRIPT_SRC.sub(repl_script, html)

    # Inline <link href="lib/....css">  (+ base64 fonts)
    def repl_link(m):
        rel = m.group(1)
        f = VENDOR / rel[len("lib/"):]
        if not f.exists():
            sys.exit(f"ERROR: {f} missing — run libfetch for that lib.")
        css = embed_css_fonts(f.read_text(encoding="utf-8", errors="replace"), f.parent)
        return "<style>\n" + css + "\n</style>"
    html2 = LINK_HREF.sub(repl_link, html2)

    # ES-module libs (e.g. three) are loaded via SG.loadLib(import) and can't be
    # inlined — copy them beside the output so the single file still loads locally.
    for name in libs:
        spec = find_spec(manifest, name)
        if spec.get("kind") == "esm":
            ensure_present(name, spec)
            copy_lib(name, spec, out.parent / "lib")
            sidecar.append(name)

    out.write_text(html2, encoding="utf-8")
    note = f" (+ sibling lib/ for ESM: {', '.join(sidecar)})" if sidecar else ""
    print(f"Single-file bundle -> {out}  ({len(html2)} bytes){note}")
    if sidecar:
        print("  Note: ES-module libs can't be inlined; keep the lib/ folder next to the .html.")


def main():
    ap = argparse.ArgumentParser(description="Bundle a deck with only the libs it uses.")
    ap.add_argument("deck")
    ap.add_argument("--mode", choices=["stage", "folder", "single"], default="stage")
    ap.add_argument("--out", help="output dir (folder) or file (single)")
    args = ap.parse_args()

    deck = Path(args.deck)
    html = deck.read_text(encoding="utf-8")
    manifest = load_manifest()
    libs = referenced_libs(html, manifest)

    if args.mode == "stage":
        mode_stage(deck, html, manifest, libs)
    elif args.mode == "folder":
        mode_folder(deck, html, manifest, libs, args.out or (deck.stem + "_bundle"))
    else:
        mode_single(deck, html, manifest, libs, args.out or (deck.stem + ".bundle.html"))


if __name__ == "__main__":
    main()
