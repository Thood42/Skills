# vendor/ — locally-vendored libraries

Decks render and self-inspect **offline**, so any library a deck uses must already be
on local disk here before building or rendering.

## Populate (run once, where you have network)
```bash
python3 scripts/libfetch.py --all          # core: chartjs mermaid katex three gsap highlight
python3 scripts/libfetch.py d3 echarts     # optional heavy/lazy extras
```
`libfetch.py` downloads each file listed in `manifest.json`, verifies it against the pinned
SRI hash (recording the hash on first fetch), pulls KaTeX's fonts, and writes `NOTICES.md`.

## Committing
This repo commits the library binaries for full offline reproducibility. After the first
`libfetch.py` run, commit the populated `vendor/<lib>/…` files and the updated `manifest.json`
(now carrying the pinned hashes) and `NOTICES.md`.

## Layout after populate
```
vendor/
├── manifest.json          pinned versions, hashes, licenses, "use_when" notes
├── NOTICES.md             aggregated third-party licenses (generated)
├── chartjs/chart.umd.min.js
├── mermaid/mermaid.min.js
├── katex/katex.min.js + katex.min.css + fonts/*
├── three/three.module.min.js
├── gsap/gsap.min.js
└── highlight/highlight.min.js + styles/github-dark.min.css
```
