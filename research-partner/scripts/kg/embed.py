"""scripts/kg/embed.py — embedding backends + `kg embed` command (Spec 2 Phase C, §2.2).

Design points (see docs/spec-2-phase-CD-retrieval.md §2.2, §2.1):

- Local by default. Preferred backend is LM Studio's OpenAI-compatible HTTP
  endpoint; if that's unreachable (closed, or the network path to it doesn't
  exist — see NOTE below), fall back to an in-process ONNX model via
  `fastembed`; if that package isn't installed either, fall back further to
  `none` (lexical-only) rather than failing the build. No silent quality
  loss: whichever mode actually ran is always printed and is recorded in
  `.kg/embed_meta.json` so `kg doctor` / `kg context` can report it.

- NOTE on reachability: when `kg` runs inside a sandboxed shell that bridges
  to this machine (as opposed to a real terminal on this machine), the
  sandbox's network is isolated from services bound to this machine's own
  localhost (LM Studio included) — connecting to the configured endpoint
  will time out or refuse there even when LM Studio is actually running.
  That's expected, not a bug: run `kg embed` from a real terminal on this
  machine (or from an agent session with genuine local shell access) to use
  LM Studio; the fastembed fallback works from anywhere.

- Incremental. `.kg/graph.sqlite`'s `embed_state` table records a content
  hash per embedded node. `build.py` carries forward embedding rows whose
  hash still matches; this module only computes vectors for node ids it is
  handed (the new/changed set `build.py` identifies), keeping `kg embed`
  cheap after the first cold run.

- Config lives in `.kg/config.toml` (gitignored — `.kg/` is wholesale
  ignored already). Written with defaults the first time `kg embed` runs if
  absent. Hand-edit it to change backend/model/endpoint; `kg embed` never
  overwrites an existing config.
"""
import os, sys, re, json, argparse, time

sys.path.insert(0, os.path.dirname(__file__))
import parse as P
import build as B

DEFAULT_CONFIG = {
    "backend": "lmstudio",
    "endpoint": "http://localhost:1234/v1/embeddings",
    "model": "nomic-embed-text-v1.5",
    "dim": 768,
    "fallback": "fastembed",
    "fallback_model": "BAAI/bge-small-en-v1.5",
    "fallback_dim": 384,
    "auth_token_file": "local-embeded-model-api-key.txt",
    "timeout_s": 4,
}

CONFIG_TEMPLATE = """# .kg/config.toml — kg embedding backend config (Spec 2 Phase C §2.2).
# This file is NOT a build product (everything else in .kg/ is) — kg never
# overwrites it once it exists. Gitignored because .kg/ is wholesale ignored.

[embed]
# lmstudio | fastembed | none
backend = "{backend}"
endpoint = "{endpoint}"
model = "{model}"
dim = {dim}

# Used automatically if `backend` is unreachable/unavailable at run time.
fallback = "{fallback}"
fallback_model = "{fallback_model}"
fallback_dim = {fallback_dim}

# Relative to the vault root. Read as a bearer token for `backend = "lmstudio"`
# if the file exists and is non-empty. Most local LM Studio setups need no
# token at all -- leave the file empty and it's simply omitted.
auth_token_file = "{auth_token_file}"

timeout_s = {timeout_s}
"""


# --------------------------------------------------------------------------
# tiny dependency-free TOML-lite reader/writer (single flat [section] table,
# string/int/float values only -- everything this config needs and nothing
# more, so we don't pull in tomli/toml as a real dependency for one file).

def _parse_simple_toml(text):
    out, section = {}, None
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        m = re.match(r"^\[(.+)\]$", line)
        if m:
            section = m.group(1).strip()
            out.setdefault(section, {})
            continue
        m = re.match(r"^([A-Za-z0-9_.-]+)\s*=\s*(.+)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val.startswith('"') and val.endswith('"'):
            val = val[1:-1]
        elif re.fullmatch(r"-?\d+", val):
            val = int(val)
        elif re.fullmatch(r"-?\d+\.\d+", val):
            val = float(val)
        target = out.setdefault(section, {}) if section else out
        target[key] = val
    return out


def load_config(root):
    """Returns the [embed] table, writing .kg/config.toml with defaults if
    it doesn't exist yet. Never overwrites an existing file."""
    kg_dir = os.path.join(root, ".kg")
    os.makedirs(kg_dir, exist_ok=True)
    path = os.path.join(kg_dir, "config.toml")
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(CONFIG_TEMPLATE.format(**DEFAULT_CONFIG))
        print(f"wrote default {os.path.relpath(path, root)}")
    text = open(path, encoding="utf-8").read()
    parsed = _parse_simple_toml(text)
    cfg = dict(DEFAULT_CONFIG)
    cfg.update(parsed.get("embed", {}))
    return cfg


def _auth_token(root, cfg):
    rel = cfg.get("auth_token_file")
    if not rel:
        return None
    path = os.path.join(root, rel)
    if not os.path.exists(path):
        return None
    tok = open(path, encoding="utf-8").read().strip()
    return tok or None


class EmbedUnavailable(Exception):
    pass


class Backend:
    name = "none"
    dim = 0

    def embed(self, texts):
        """texts: list[str] -> list[list[float]]. Raises EmbedUnavailable on
        any failure so the caller can fall through to the next backend."""
        raise NotImplementedError


class NoneBackend(Backend):
    name = "none"
    dim = 0

    def embed(self, texts):
        raise EmbedUnavailable("backend explicitly set to none (lexical-only)")


class LMStudioBackend(Backend):
    """LM Studio's `model` field has to match its own internal identifier for
    the loaded model exactly (observed live, 2026-08-29: a model downloaded
    as `nomic-ai/nomic-embed-text-v1.5-GGUF` surfaces to the API as
    `text-embedding-nomic-embed-text-v1.5@q8_0` -- quantization suffix and
    all, not the config-friendly name this file's default guesses at). Rather
    than hardcode a guess that breaks the moment the user picks a different
    quantization or a different embedding model, this backend calls
    `GET /v1/models` once per process and resolves the configured name against
    whatever's actually loaded, falling back to the first embedding-flavored
    model it finds. Never crashes on a mismatch -- it adapts and says so."""

    def __init__(self, endpoint, model, dim, token=None, timeout_s=4):
        self.endpoint, self.configured_model, self.dim = endpoint, model, dim
        self.model = model
        self.token, self.timeout_s = token, timeout_s
        self._resolved = False
        self.name = f"lmstudio:{model}"

    def _headers(self):
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _models_url(self):
        # endpoint is normally .../v1/embeddings -- swap the last segment for /models
        base = self.endpoint.rsplit("/", 1)[0]
        return base + "/models"

    def _resolve_model(self):
        import requests
        try:
            resp = requests.get(self._models_url(), headers=self._headers(), timeout=self.timeout_s)
            resp.raise_for_status()
            ids = [m["id"] for m in resp.json().get("data", [])]
        except Exception:
            return self.configured_model  # can't list models -- try the configured name as-is
        if not ids:
            return self.configured_model
        if self.configured_model in ids:
            return self.configured_model
        for mid in ids:
            if "embed" in mid.lower():
                return mid
        return ids[0]

    def embed(self, texts):
        import requests
        if not self._resolved:
            resolved = self._resolve_model()
            if resolved != self.model:
                print(f"lmstudio: configured model {self.configured_model!r} not loaded as-is; "
                      f"using {resolved!r} (from GET /v1/models)")
            self.model = resolved
            self.name = f"lmstudio:{self.model}"
            self._resolved = True
        try:
            resp = requests.post(
                self.endpoint,
                headers=self._headers(),
                json={"model": self.model, "input": texts},
                timeout=self.timeout_s,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise EmbedUnavailable(f"LM Studio endpoint {self.endpoint} unreachable: {e}") from e
        rows = sorted(data["data"], key=lambda r: r["index"])
        return [r["embedding"] for r in rows]


class FastEmbedBackend(Backend):
    def __init__(self, model, dim):
        try:
            from fastembed import TextEmbedding
        except ImportError as e:
            raise EmbedUnavailable(
                "fastembed not installed -- `pip install fastembed` for the in-process "
                "local fallback (roughly a 100-500MB one-time model download)"
            ) from e
        try:
            self._model = TextEmbedding(model_name=model)
        except Exception as e:
            raise EmbedUnavailable(f"fastembed could not load model {model!r}: {e}") from e
        self.model, self.dim = model, dim
        self.name = f"fastembed:{model}"

    def embed(self, texts):
        return [v.tolist() for v in self._model.embed(texts)]


def resolve_backend(root, cfg=None, verbose=True):
    """Tries `backend`, then `fallback`, then `none`. Returns (Backend, notes)
    where notes is a list of human-readable strings explaining what happened
    -- printed by `kg embed`/`kg doctor`, never swallowed silently."""
    cfg = cfg or load_config(root)
    notes = []
    order = [cfg["backend"], cfg.get("fallback"), "none"]
    token = _auth_token(root, cfg)
    for kind in order:
        if not kind:
            continue
        try:
            if kind == "lmstudio":
                be = LMStudioBackend(cfg["endpoint"], cfg["model"], int(cfg["dim"]),
                                      token=token, timeout_s=float(cfg.get("timeout_s", 4)))
                be.embed(["connectivity probe"])  # fail fast, don't wait for the real batch
            elif kind == "fastembed":
                be = FastEmbedBackend(cfg["fallback_model"], int(cfg["fallback_dim"]))
            elif kind == "none":
                be = NoneBackend()
            else:
                notes.append(f"unknown backend {kind!r} in config, skipping")
                continue
            if kind != order[0]:
                notes.append(f"backend {order[0]!r} unavailable -> falling back to {kind!r}")
            notes.append(f"using embedding backend: {be.name}")
            if verbose:
                for n in notes:
                    print(n)
            return be, notes
        except EmbedUnavailable as e:
            notes.append(f"backend {kind!r} unavailable: {e}")
            continue
    # should be unreachable since "none" always succeeds, but be defensive
    be = NoneBackend()
    notes.append("using embedding backend: none (lexical-only)")
    if verbose:
        for n in notes:
            print(n)
    return be, notes


# --------------------------------------------------------------------------

def embed_text_for(doc):
    """What actually gets embedded for a node: title + body, capped so one
    huge note can't dominate batch latency or blow past a backend's context
    window."""
    title = doc.get("title") or doc["id"]
    body = (doc.get("body") or "")[:4000]
    return f"{title}\n\n{body}"


def main():
    ap = argparse.ArgumentParser(description="Embed nodes missing a current-hash vector.")
    ap.add_argument("--root", default=None)
    ap.add_argument("--all", action="store_true", help="re-embed every node, ignoring content_hash")
    ap.add_argument("--batch-size", type=int, default=16)
    args = ap.parse_args()

    t0 = time.time()
    root = args.root or P.vault_root()
    cfg = load_config(root)
    backend, _ = resolve_backend(root, cfg)

    sqlite_path = os.path.join(root, ".kg", "graph.sqlite")
    if not os.path.exists(sqlite_path):
        print("no .kg/graph.sqlite -- run `kg build` first")
        return 1

    pending = B.pending_embeddings(sqlite_path, force_all=args.all)
    print(f"{len(pending)} node(s) need embedding")
    if not pending or backend.name == "none":
        if backend.name == "none" and pending:
            print("embedding backend is 'none' -- leaving these lexical-only "
                  "(kg context/search still work, degraded to FTS + graph expansion)")
        print(f"[{time.time()-t0:.2f}s]")
        return 0

    computed = {}
    ids = list(pending.keys())
    for i in range(0, len(ids), args.batch_size):
        batch_ids = ids[i:i + args.batch_size]
        texts = [embed_text_for(pending[nid]) for nid in batch_ids]
        try:
            vectors = backend.embed(texts)
        except EmbedUnavailable as e:
            print(f"embedding failed mid-run ({e}); stopping, keeping what succeeded so far")
            break
        for nid, vec in zip(batch_ids, vectors):
            computed[nid] = vec
        print(f"  embedded {min(i+args.batch_size, len(ids))}/{len(ids)}")

    n_written = B.write_embeddings(sqlite_path, computed, pending, backend.name,
                                    backend.dim or (len(next(iter(computed.values()))) if computed else 0))
    print(f"wrote {n_written} embedding(s) via {backend.name}  [{time.time()-t0:.2f}s]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
