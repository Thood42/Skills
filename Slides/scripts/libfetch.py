#!/usr/bin/env python3
"""
libfetch.py — populate vendor/ with pinned, hash-verified libraries.

Run this ONCE in an environment that has outbound network (your normal machine).
The slides render/inspect environment is offline by design, so the libraries must
already be on local disk before you build or render a deck.

USAGE
  python3 scripts/libfetch.py --all          # fetch the core set
  python3 scripts/libfetch.py chartjs katex  # fetch specific libs (core or lazy)
  python3 scripts/libfetch.py --list         # show manifest entries + fetched status
  python3 scripts/libfetch.py --all --verify-only   # re-check hashes, don't download

INTEGRITY MODEL (trust-on-first-use, then pin)
  - If a file's integrity in manifest.json is null, libfetch downloads it, computes the
    sha384 SRI, writes it back into the manifest, and prints it. Review and commit that.
  - If integrity is already set, libfetch verifies the download against it and FAILS on
    mismatch (supply-chain guard). To pin BEFORE first download, paste the official SRI
    from jsdelivr/cdnjs into the manifest yourself.

OUTPUT
  vendor/<lib>/<files...>      the library files (+ fonts/ for KaTeX-style CSS)
  vendor/NOTICES.md            aggregated third-party license notices
"""
import argparse, base64, hashlib, json, re, sys, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"
MANIFEST = VENDOR / "manifest.json"
UA = "slides-libfetch/1.0 (+local vendoring; offline-first decks)"


def load_manifest():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def save_manifest(m):
    MANIFEST.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sri(data: bytes) -> str:
    return "sha384-" + base64.b64encode(hashlib.sha384(data).digest()).decode("ascii")


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"\nERROR {e.code} fetching {url}\n{e.reason}\n")
    except Exception as e:  # noqa: BLE001
        raise SystemExit(
            f"\nERROR fetching {url}\n  {e}\n\n"
            "This environment may have no outbound network. Run libfetch.py somewhere\n"
            "with internet access, then copy the populated vendor/ directory back.\n"
        )


def iter_entries(manifest):
    for group in ("core", "lazy"):
        for name, spec in manifest.get(group, {}).items():
            if name.startswith("_"):
                continue
            yield group, name, spec


def find_spec(manifest, name):
    for group in ("core", "lazy"):
        spec = manifest.get(group, {}).get(name)
        if spec:
            return group, spec
    return None, None


def font_urls_from_css(css_text: str, css_url: str):
    """Extract non-data url(...) refs from CSS and resolve them against the css URL dir."""
    base_dir = css_url.rsplit("/", 1)[0] + "/"
    out = []
    for raw in re.findall(r"url\(([^)]+)\)", css_text):
        ref = raw.strip().strip("'\"")
        if ref.startswith("data:"):
            continue
        ref = ref.split("?", 1)[0].split("#", 1)[0]
        out.append((ref, base_dir + ref))
    # de-dup, preserve order
    seen, uniq = set(), []
    for rel, url in out:
        if rel not in seen:
            seen.add(rel)
            uniq.append((rel, url))
    return uniq


def fetch_lib(name, spec, manifest, verify_only=False):
    libdir = VENDOR / name
    libdir.mkdir(parents=True, exist_ok=True)
    integ = spec.setdefault("integrity", {})
    css_files = set(spec.get("css", []))
    changed = False

    for fname in spec["files"]:
        dest = libdir / fname
        url = spec["base"] + fname
        if verify_only:
            if not dest.exists():
                print(f"  [{name}] MISSING {fname}")
                continue
            data = dest.read_bytes()
        else:
            print(f"  [{name}] GET {url}")
            data = download(url)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)

        got = sri(data)
        want = integ.get(fname)
        if want is None:
            integ[fname] = got
            changed = True
            print(f"        pinned {fname} -> {got}")
        elif want != got:
            raise SystemExit(
                f"\nINTEGRITY MISMATCH for {name}/{fname}\n"
                f"  manifest: {want}\n  download: {got}\n"
                "Refusing to use a file that doesn't match the pinned hash.\n"
            )
        else:
            print(f"        verified {fname}")

        # KaTeX-style: parse CSS for fonts and fetch them too
        if spec.get("parse_css_fonts") and fname in css_files and not verify_only:
            for rel, furl in font_urls_from_css(data.decode("utf-8", "replace"), url):
                fdest = libdir / rel
                fdest.parent.mkdir(parents=True, exist_ok=True)
                print(f"        font {rel}")
                fdest.write_bytes(download(furl))

    return changed


def write_notices(manifest):
    lines = [
        "# Third-party notices",
        "",
        "These libraries are vendored locally so decks render offline and reproducibly.",
        "Each is redistributed under its own license, linked below.",
        "",
    ]
    for _group, name, spec in iter_entries(manifest):
        lines.append(f"## {name} {spec.get('version','')}".rstrip())
        lines.append(f"- License: {spec.get('license','?')}")
        if spec.get("license_url"):
            lines.append(f"- License text: {spec['license_url']}")
        lines.append(f"- Source: {spec.get('base','')}")
        lines.append("")
    (VENDOR / "NOTICES.md").write_text("\n".join(lines), encoding="utf-8")


def cmd_list(manifest):
    for group, name, spec in iter_entries(manifest):
        files = spec.get("files", [])
        present = all((VENDOR / name / f).exists() for f in files)
        mark = "✓" if present else "·"
        print(f"  {mark} {name:10s} {spec.get('version',''):10s} [{group}]  {spec.get('use_when','')}")


def main():
    ap = argparse.ArgumentParser(description="Populate vendor/ with pinned libraries.")
    ap.add_argument("libs", nargs="*", help="lib names to fetch (default: --all core)")
    ap.add_argument("--all", action="store_true", help="fetch all core libraries")
    ap.add_argument("--list", action="store_true", help="list manifest entries + status")
    ap.add_argument("--verify-only", action="store_true", help="re-check hashes, no download")
    args = ap.parse_args()

    manifest = load_manifest()

    if args.list:
        cmd_list(manifest)
        return

    targets = []
    if args.all:
        targets = [n for n in manifest.get("core", {}) if not n.startswith("_")]
    targets += [n for n in args.libs if n not in targets]
    if not targets:
        ap.error("nothing to do: pass --all or one or more lib names (see --list)")

    any_changed = False
    for name in targets:
        _group, spec = find_spec(manifest, name)
        if not spec:
            raise SystemExit(f"unknown library '{name}' (see --list)")
        print(f"{name} {spec.get('version','')}")
        if fetch_lib(name, spec, manifest, verify_only=args.verify_only):
            any_changed = True

    if any_changed and not args.verify_only:
        save_manifest(manifest)
        print("\nUpdated manifest.json with newly-pinned hashes — review and commit them.")
    write_notices(manifest)
    print(f"\nDone. vendor/ populated. NOTICES.md written ({len(targets)} libs).")


if __name__ == "__main__":
    main()
