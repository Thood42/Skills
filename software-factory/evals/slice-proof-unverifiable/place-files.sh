#!/usr/bin/env bash
# Builds this case's working directory: the tasktrack project in the state the case needs.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
PY=""
for c in python3 python; do
  if "$c" -c 'import sys' >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "python is required to build the fixture" >&2; exit 1; }
"$PY" "$here/../files/build_fixture.py" slice-proof-unverifiable .
