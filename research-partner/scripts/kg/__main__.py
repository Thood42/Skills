"""kg CLI entrypoint. Usage (from the vault root):

    python3 -m scripts.kg migrate   [--apply]
    python3 -m scripts.kg build     [--dry-run]
    python3 -m scripts.kg generate  [--dry-run]
    python3 -m scripts.kg doctor
    python3 -m scripts.kg embed     [--all]
    python3 -m scripts.kg search    "<query>" [--k 12] [--type claim] [--hops 1]
    python3 -m scripts.kg neighbors <note> [--predicate supports] [--depth 2]
    python3 -m scripts.kg path      <a> <b> [--max-hops 4]
    python3 -m scripts.kg subgraph  <note> [--depth 2] [--format md|mermaid|canvas]
    python3 -m scripts.kg context   "<query>" [--budget 8000]
    python3 -m scripts.kg eval                              # measured retrieval eval (Phase C §2.6)
    python3 -m scripts.kg communities [--resolution 1.0] [--write] [--min-size 3]   # Phase D §3.1
    python3 -m scripts.kg gaps                              # Phase D §3.2 gap scan (writes gaps-report.md)
    python3 -m scripts.kg contradictions                    # Phase D §3.2 explicit + latent scan (JSON)
    python3 -m scripts.kg ingest    <path|url>               # Phase D §3.3 ingestion -> Inbox

Each subcommand is also runnable standalone: `python3 scripts/kg/build.py`, etc.
search/neighbors/path/subgraph/context are dispatched through retrieve.py's own
argparse (it needs subcommand-specific positional args); communities/gaps/
contradictions are dispatched the same way through analytics.py's own argparse;
everything else through the module's own main().
"""
import sys, argparse

from . import migrate as _migrate
from . import build as _build
from . import generate as _generate
from . import doctor as _doctor
from . import embed as _embed
from . import retrieve as _retrieve
from . import eval_retrieval as _eval
from . import analytics as _analytics
from . import ingest as _ingest

COMMANDS = {"migrate": _migrate, "build": _build, "generate": _generate, "doctor": _doctor,
            "embed": _embed, "eval": _eval, "ingest": _ingest}
RETRIEVE_COMMANDS = {"search", "neighbors", "path", "subgraph", "context"}
ANALYTICS_COMMANDS = {"communities", "gaps", "contradictions"}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    known = set(COMMANDS) | RETRIEVE_COMMANDS | ANALYTICS_COMMANDS
    if not argv or argv[0] not in known:
        print(__doc__)
        return 1
    cmd, rest = argv[0], argv[1:]
    old_argv = sys.argv
    try:
        if cmd in RETRIEVE_COMMANDS:
            sys.argv = ["kg"] + argv  # retrieve.py's own argparse expects the subcommand as argv[1]
            return _retrieve.main()
        if cmd in ANALYTICS_COMMANDS:
            sys.argv = ["kg"] + argv  # analytics.py's own argparse expects the subcommand as argv[1]
            return _analytics.main()
        sys.argv = [f"kg {cmd}"] + rest
        return COMMANDS[cmd].main()
    finally:
        sys.argv = old_argv


if __name__ == "__main__":
    sys.exit(main())
