#!/usr/bin/env bash
# Rebuild the generated layers of the vault and verify it.
#
# ORDER MATTERS. build compiles notes/ into .kg/; generate projects that compiled
# graph back out as entity and source hub notes; doctor validates the result the
# way Obsidian would. Running generate before build regenerates hubs from a stale
# graph, and running doctor before generate reports dead links for hubs that are
# about to exist.
#
# doctor MUST end PASS. A non-PASS doctor is a broken vault, not a warning —
# every link-level bug this project ever shipped was one that a green checker
# failed to see.
set -e
cd "$(dirname "$0")/.."
python3 -m scripts.kg build      # notes/*.md      -> .kg/*.json + .kg/graph.sqlite
python3 -m scripts.kg generate   # compiled graph  -> notes/entities/*.md, notes/sources/*.md, map.md
python3 -m scripts.kg doctor     # link resolution + graph invariants + plugin/retrieval readiness

# Optional, when the retrieval and analytics layers are in use:
#   python3 -m scripts.kg embed              # (re)embed changed notes
#   python3 -m scripts.kg communities --write
#   python3 -m scripts.kg gaps               # refreshes gaps-report.md
