"""scripts/kg/ingest.py — kg ingest <path|url> (Spec 2 Phase D §3.3).

Pulls external material into the vault as candidate notes, never verified
notes: one `source` note plus N `claim` notes, all at `status: seed`, so a
human reviews and promotes/rejects each one via the Inbox view
(bases/inbox.base) before it counts as part of the graph's real evidence.
Nothing here ever writes `status: verified`.

Supported inputs:
  - a local .pdf file  -- text extracted with pypdf (falls back to
    pdfplumber if pypdf gets nothing off any page, e.g. a scanned/rotated one)
  - a http(s):// URL    -- fetched with requests, main text pulled out with a
    simple boilerplate-stripping heuristic over BeautifulSoup's parse

.epub is explicitly out of scope for this pass (the spec mentions it; no
epub library is part of this environment's verified dependency set) --
ingest refuses with a clear message rather than guessing at a partial
extraction.
"""
import os, sys, re, json, argparse, hashlib, datetime as _dt

sys.path.insert(0, os.path.dirname(__file__))
import parse as P

# See generate.py — never freeze the clock at packaging time.
TODAY = _dt.date.today().isoformat()


def yq(s):
    return json.dumps(str(s), ensure_ascii=False)


def flow_list(items):
    return "[" + ", ".join(yq(i) for i in items) + "]"


def _slugify(s, maxlen=60):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:maxlen] or hashlib.sha1(s.encode()).hexdigest()[:10]


def _extract_pdf(path):
    text_pages = []
    try:
        import pypdf
        reader = pypdf.PdfReader(path)
        for page in reader.pages:
            text_pages.append(page.extract_text() or "")
    except Exception:
        text_pages = []
    if not any(t.strip() for t in text_pages):
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                text_pages = [p.extract_text() or "" for p in pdf.pages]
        except Exception as e:
            raise SystemExit(f"could not extract text from {path} with pypdf or pdfplumber: {e}")
    return "\n\n".join(text_pages)


def _extract_url(url):
    import requests
    from bs4 import BeautifulSoup
    resp = requests.get(url, timeout=20, headers={"User-Agent": "kg-ingest/1.0"})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "form", "noscript"]):
        tag.decompose()
    container = soup.find("article") or soup.find("main") or soup.body or soup
    text = container.get_text("\n")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    title = soup.title.string.strip() if (soup.title and soup.title.string) else url
    return title, "\n\n".join(lines)


def _chunk(text, min_chars=200, max_chars=900, max_chunks=8):
    """Paragraph-boundary chunking: greedily accumulate paragraphs until a
    chunk crosses min_chars, cut at max_chars. Deliberately simple -- these
    are candidate claim seeds a human reviews, not a final segmentation."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip() and len(p.strip()) > 40]
    chunks, cur = [], ""
    for p in paras:
        if len(cur) + len(p) > max_chars and len(cur) >= min_chars:
            chunks.append(cur.strip())
            cur = p
        else:
            cur = (cur + "\n\n" + p) if cur else p
        if len(chunks) >= max_chunks:
            break
    if cur.strip() and len(chunks) < max_chunks:
        chunks.append(cur.strip())
    return chunks[:max_chunks]


def _write_source_note(root, slug, title, source_type, loc, extraction_run):
    src_dir = os.path.join(root, "notes", "sources")
    os.makedirs(src_dir, exist_ok=True)
    path = os.path.join(src_dir, f"{slug}.md")
    lines = [
        "---", "note-type: source", f"handle: {slug}", f"source-type: {source_type}",
        f"title: {yq(title)}", f"aliases: {flow_list([f'Source: {slug}', slug])}",
        f"tags: {flow_list(['source', 'source-secondary', 'inbox'])}",
        "tier: secondary", "status: seed",
    ]
    if source_type == "url":
        lines.append(f"url: {yq(loc)}")
    lines += [
        f"created: {TODAY}", "asserted-by: agent", f"extraction-run: {extraction_run}",
        "---", "", f"# {title}", "",
        "> [!warning] Ingested via `kg ingest` — status: seed. Not yet reviewed or promoted. "
        "Tier defaulted to `secondary` pending human judgment; set it deliberately on promotion.",
        "",
        f"Ingested from: <{loc}>" if source_type == "url" else f"Ingested from: `{loc}`",
        "",
        "---", "", "*Ingested by `scripts/kg/ingest.py`. Review and promote via the Inbox view "
        "(`bases/inbox.base`) — set `status: verified` (or `draft`) and a real `tier` once checked.*",
    ]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return path


def _write_claim_note(root, slug, idx, chunk_text, source_slug, extraction_run):
    claims_dir = os.path.join(root, "notes", "claims")
    os.makedirs(claims_dir, exist_ok=True)
    stem = f"{slug}-chunk-{idx}"
    path = os.path.join(claims_dir, f"{stem}.md")
    first_line = chunk_text.strip().splitlines()[0][:100] if chunk_text.strip() else stem
    title = f"Candidate claim from {slug} #{idx}: {first_line}"
    lines = [
        "---", "note-type: claim", f"title: {yq(title)}", "status: seed", "confidence: 0.3",
        f"tags: {flow_list(['inbox', 'ingested'])}",
        f"created: {TODAY}", f"updated: {TODAY}",
        f"evidence: {flow_list([f'[[{source_slug}]]'])}",
        "asserted-by: agent", f"extraction-run: {extraction_run}",
        "---", "", f"# {title}", "", chunk_text.strip(), "",
        "---", "", "*Ingested by `scripts/kg/ingest.py` as a raw candidate — not verified. Review, "
        "rewrite as a real atomic claim (or reject), and set `status`/`confidence` deliberately. "
        "Promote via the Inbox view (`bases/inbox.base`).*",
    ]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return path


def ingest(root, source):
    is_url = re.match(r"^https?://", source, re.IGNORECASE)
    extraction_run = f"ingest-{_dt.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}"
    if is_url:
        title, text = _extract_url(source)
        slug = _slugify(title) or _slugify(source)
        source_type, loc = "url", source
    elif source.lower().endswith(".epub"):
        raise SystemExit("EPUB ingestion is out of scope for this pass (no verified epub library "
                          "in this environment) — convert to PDF first, or ask for epub support "
                          "to be added deliberately.")
    elif source.lower().endswith(".pdf"):
        text = _extract_pdf(source)
        title = os.path.splitext(os.path.basename(source))[0]
        slug = _slugify(title)
        source_type, loc = "pdf", os.path.abspath(source)
    else:
        raise SystemExit(f"don't know how to ingest {source!r} — expected a .pdf path or an "
                          "http(s):// URL")

    if not text.strip():
        raise SystemExit(f"extracted 0 characters of text from {source!r} — nothing to ingest")

    src_path = _write_source_note(root, slug, title, source_type, loc, extraction_run)
    chunks = _chunk(text)
    claim_paths = [_write_claim_note(root, slug, i + 1, c, slug, extraction_run)
                   for i, c in enumerate(chunks)]
    return src_path, claim_paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="local .pdf path or http(s):// URL")
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = args.root or P.vault_root()

    src_path, claim_paths = ingest(root, args.source)
    print(f"source note: {os.path.relpath(src_path, root)}")
    print(f"{len(claim_paths)} candidate claim note(s):")
    for p in claim_paths:
        print("  ", os.path.relpath(p, root))
    print("\nAll notes written at status: seed. Run `kg build` to compile them in, then review "
          "and promote/reject via the Inbox view (bases/inbox.base) — nothing here is verified yet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
