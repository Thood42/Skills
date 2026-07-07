#!/usr/bin/env bash
# render.sh — capture each slide to PNG + a contact sheet, deterministically.
#
# USAGE
#   ./render.sh <deck.html> <num_slides> <output_dir>
#
# EXAMPLE
#   ./render.sh my-deck.html 12 shots
#   -> shots/slide-01.png ... shots/slide-12.png  +  shots/_contact.png (3-wide)
#
# REPRODUCIBILITY CHECK (the important one for charts / 3D / motion)
#   GOLDEN=1 ./render.sh my-deck.html 12 shots
#   -> renders every slide TWICE and asserts the two PNGs are pixel-identical.
#     A non-zero diff means residual nondeterminism (an unseeded Math.random, or
#     an animation that did not freeze to its final state). Fix before presenting.
#
# REQUIRES
#   - Google Chrome (headless) at /opt/google/chrome/chrome OR google-chrome-stable
#   - ImageMagick (convert + montage; compare for the GOLDEN check)
#
# WHY CAPTURE IS DETERMINISTIC HERE
#   - --force-prefers-reduced-motion makes the ambient CSS loops resolve to their
#     resting base state AND flips SG.static -> true, so the deck's count-ups, rings,
#     and any library visuals (Chart.js/Three.js/GSAP) jump to their FINISHED frame
#     instead of being frozen mid-animation by the headless virtual-time clock.
#   - ?static=1 is also appended as a belt-and-suspenders for SG.static.
#   - --allow-file-access-from-files lets the page load locally-vendored lib scripts
#     (./lib/...) over file:// -- without it they silently fail, like CDN links do.
#   - The live deck (opened normally in a browser) still animates for the audience;
#     only this capture path is frozen.
#
# NOTES
#   - Decks use hash deep links (#1, #2, ...). We pass file://deck?static=1#N.
#   - CDN fonts fall back to installed fonts in PNGs (offline) -- expected.
#   - dbus warnings on stderr are harmless.

set -euo pipefail

# ---- PDF export: one slide per page, 16:9, frozen motion --------------------
#   ./render.sh --pdf <deck.html> [out.pdf]
# Uses Chrome's print-to-pdf against the deck's @media print stylesheet, which
# lays every .slide on its own 1280x720 page. Same headless engine as the PNG
# path, so the PDF matches what the golden-frame check verifies.
if [[ "${1:-}" == "--pdf" ]]; then
  shift
  PDF_DECK="${1:?Usage: render.sh --pdf <deck.html> [out.pdf]}"
  PDF_OUT="${2:-${PDF_DECK%.html}.pdf}"
  PCHROME=""
  for c in /opt/google/chrome/chrome /usr/bin/google-chrome-stable /usr/bin/google-chrome /usr/bin/chromium-browser /usr/bin/chromium; do
    [[ -x "$c" ]] && PCHROME="$c" && break
  done
  [[ -z "$PCHROME" ]] && { echo "ERROR: Chrome not found for --pdf." >&2; exit 1; }
  PDF_ABS="$(realpath "$PDF_DECK")"
  echo "Printing $PDF_ABS -> $PDF_OUT (one slide per page, 16:9)"
  "$PCHROME" --headless --disable-gpu --no-sandbox \
    --force-prefers-reduced-motion --allow-file-access-from-files \
    --run-all-compositor-stages-before-draw --virtual-time-budget=8000 \
    --no-pdf-header-footer --print-to-pdf="$PDF_OUT" \
    "file://$PDF_ABS?static=1" 2>/dev/null || true
  echo "Done -> $PDF_OUT"
  exit 0
fi

DECK="${1:?Usage: render.sh <deck.html> <num_slides> <output_dir>}"
N="${2:?}"
OUTDIR="${3:?}"

CHROME=""
for candidate in \
    /opt/google/chrome/chrome \
    /usr/bin/google-chrome-stable \
    /usr/bin/google-chrome \
    /usr/bin/chromium-browser \
    /usr/bin/chromium; do
  if [[ -x "$candidate" ]]; then CHROME="$candidate"; break; fi
done
if [[ -z "$CHROME" ]]; then
  echo "ERROR: Chrome not found. Install google-chrome-stable or chromium-browser." >&2
  exit 1
fi

DECK_ABS="$(realpath "$DECK")"
mkdir -p "$OUTDIR"

# One slide -> one PNG. $1=slide index, $2=destination file.
shoot(){
  local i="$1" out="$2"
  "$CHROME" \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --disable-software-rasterizer \
    --force-prefers-reduced-motion \
    --allow-file-access-from-files \
    --run-all-compositor-stages-before-draw \
    --virtual-time-budget=6000 \
    --window-size=1280,720 \
    --screenshot="$out" \
    ${CHROME_EXTRA:-} \
    "file://$DECK_ABS?static=1#$i" \
    2>/dev/null || true
}

echo "Rendering $N slides from $DECK_ABS -> $OUTDIR/"
for i in $(seq 1 "$N"); do
  OUTFILE="$OUTDIR/slide-$(printf '%02d' "$i").png"
  shoot "$i" "$OUTFILE"
  echo "  slide $i -> $OUTFILE"
done

if command -v montage &>/dev/null; then
  CONTACT="$OUTDIR/_contact.png"
  montage "$OUTDIR"/slide-*.png -geometry +4+4 -tile 3x -background '#02040a' "$CONTACT"
  echo "Contact sheet -> $CONTACT"
else
  echo "ImageMagick 'montage' not found -- skipping contact sheet."
fi

# ---- Golden-frame reproducibility check (opt-in) -------------------------------
if [[ "${GOLDEN:-0}" == "1" ]]; then
  if ! command -v compare &>/dev/null; then
    echo "GOLDEN check requested but ImageMagick 'compare' is missing." >&2
    exit 2
  fi
  echo "Golden-frame check: re-rendering each slide and diffing..."
  GDIR="$OUTDIR/_golden"; mkdir -p "$GDIR"
  fails=0
  for i in $(seq 1 "$N"); do
    A="$OUTDIR/slide-$(printf '%02d' "$i").png"
    B="$GDIR/slide-$(printf '%02d' "$i").png"
    shoot "$i" "$B"
    AE="$(compare -metric AE "$A" "$B" null: 2>&1 || true)"
    AE="${AE%%.*}"; AE="${AE//[^0-9]/}"; AE="${AE:-0}"
    if [[ "$AE" == "0" ]]; then
      echo "  slide $i: reproducible ok"
    else
      echo "  slide $i: NON-DETERMINISTIC ($AE px differ) -- see $B"
      fails=$((fails+1))
    fi
  done
  if [[ "$fails" -gt 0 ]]; then
    echo "REPRODUCIBILITY FAIL: $fails slide(s) differ between renders." >&2
    echo "Likely an unseeded Math.random (use SG.rng) or an animation not frozen under SG.static." >&2
    exit 3
  fi
  echo "All $N slides render identically twice -- reproducible."
fi

echo "Done."
