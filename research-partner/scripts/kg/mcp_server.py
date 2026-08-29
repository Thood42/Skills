"""scripts/kg/mcp_server.py — stdio MCP server wrapping search/context/
neighbors/path/subgraph (Spec 2 Phase C §2.5) plus gaps/contradictions
(Spec 2 Phase D §3.2, spec's §7.5 tool list). Read-only: this is the "read"
channel in the spec's two-channel table; live vault writes go through
Obsidian's Local REST API MCP endpoint instead, not through here.

Deliberately dependency-free (stdlib only): a minimal newline-delimited
JSON-RPC 2.0 loop implementing just what an MCP client needs from a tools
server (`initialize`, `notifications/initialized`, `tools/list`,
`tools/call`). The official `mcp` Python SDK pulls in a large dependency
chain (pydantic, uvicorn, starlette, ...) for what is, over stdio, a small
protocol surface; hand-rolling it keeps `kg` runnable anywhere `python3` is,
which matters since this vault's own tooling already had to work around a
FUSE-mounted filesystem and an air-gapped-from-localhost sandbox more than
once. If the `mcp` SDK is ever wanted for HTTP/SSE transports or richer
capabilities, swapping this module out is a self-contained change --
retrieve.py's functions are the actual implementation either way.
"""
import sys, os, json

sys.path.insert(0, os.path.dirname(__file__))
import parse as P
import retrieve as R
import analytics as A

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "kg", "version": "2.0.0"}

TOOLS = [
    {
        "name": "kg_search",
        "description": "Hybrid (lexical + semantic) search over the vault's compiled graph. "
                        "Returns ranked notes with id/title/note_type/path/score.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "k": {"type": "integer", "default": 12},
                "note_type": {"type": "string", "description": "filter to concept|claim|question|source|entity"},
                "hops": {"type": "integer", "default": 0, "description": "expand results via graph neighbors"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "kg_context",
        "description": "The retrieval pack an agent turn should actually consume: hybrid search, "
                        "graph-expanded, budgeted, fully cited markdown. Call this instead of grepping the vault.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "budget": {"type": "integer", "default": 8000, "description": "approx token budget"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "kg_neighbors",
        "description": "Typed-relation neighbors of a note, optionally filtered to one predicate, "
                        "up to a given depth (both edge directions).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "note": {"type": "string", "description": "note id (filename stem)"},
                "predicate": {"type": "string"},
                "depth": {"type": "integer", "default": 2},
            },
            "required": ["note"],
        },
    },
    {
        "name": "kg_path",
        "description": "Shortest path between two notes over the typed-relation graph (edge direction ignored "
                        "for connectivity, recorded per hop).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "a": {"type": "string"}, "b": {"type": "string"},
                "max_hops": {"type": "integer", "default": 4},
            },
            "required": ["a", "b"],
        },
    },
    {
        "name": "kg_subgraph",
        "description": "A note's local neighborhood rendered as markdown, a Mermaid flowchart, "
                        "or an Obsidian Canvas JSON document.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "note": {"type": "string"},
                "depth": {"type": "integer", "default": 2},
                "format": {"type": "string", "enum": ["md", "mermaid", "canvas"], "default": "md"},
            },
            "required": ["note"],
        },
    },
    {
        "name": "kg_gaps",
        "description": "Phase D gap scan: low-degree entities, notes with no evidence, low-confidence "
                        "notes, open questions stale > 30 days, plus Adamic-Adar suggested links. "
                        "Nothing here is applied automatically -- surfaced for review only. Also "
                        "refreshes gaps-report.md on disk.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "kg_contradictions",
        "description": "Phase D contradiction scan: explicit `contradicts` edges plus latent tension "
                        "candidates (high-similarity note pairs sharing an `about` target with no "
                        "declared relationship -- see analytics.py's docstring on why this is not the "
                        "same claim as an opposing-stance contradiction).",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def _text_result(text, is_error=False):
    result = {"content": [{"type": "text", "text": text}]}
    if is_error:
        result["isError"] = True
    return result


def call_tool(root, name, args):
    args = args or {}
    if name == "kg_search":
        return _text_result(json.dumps(R.search(
            root, args["query"], k=args.get("k", 12),
            note_type=args.get("note_type"), hops=args.get("hops", 0)), indent=2))
    if name == "kg_context":
        return _text_result(R.context(root, args["query"], budget=args.get("budget", 8000)))
    if name == "kg_neighbors":
        return _text_result(json.dumps(R.neighbors(
            root, args["note"], predicate=args.get("predicate"), depth=args.get("depth", 2)), indent=2))
    if name == "kg_path":
        return _text_result(json.dumps(R.path(
            root, args["a"], args["b"], max_hops=args.get("max_hops", 4)), indent=2))
    if name == "kg_subgraph":
        return _text_result(R.subgraph(
            root, args["note"], depth=args.get("depth", 2), fmt=args.get("format", "md")))
    if name == "kg_gaps":
        con = R.connect_ro(root)
        try:
            _path, _changed, gaps, contra, links = A.write_gaps_report(root, con)
        finally:
            con.close()
        return _text_result(json.dumps({"gaps": gaps, "contradictions_explicit": contra["explicit"],
                                          "latent_tension": contra["latent"], "suggested_links": links},
                                         indent=2, ensure_ascii=False))
    if name == "kg_contradictions":
        con = R.connect_ro(root)
        try:
            contra = A.find_contradictions(root, con)
        finally:
            con.close()
        return _text_result(json.dumps(contra, indent=2, ensure_ascii=False))
    return _text_result(f"unknown tool: {name}", is_error=True)


def handle(root, msg):
    """Returns a response dict, or None for notifications (no id -> no reply)."""
    method = msg.get("method")
    msg_id = msg.get("id")

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": SERVER_INFO,
        }}
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = msg.get("params") or {}
        try:
            result = call_tool(root, params.get("name"), params.get("arguments"))
        except Exception as e:  # noqa: BLE001 -- a tool failure should be an MCP error result, not a dead server
            result = _text_result(f"kg tool error: {e}", is_error=True)
        return {"jsonrpc": "2.0", "id": msg_id, "result": result}
    if msg_id is None:
        return None  # unknown notification -- ignore, don't crash the loop
    return {"jsonrpc": "2.0", "id": msg_id,
            "error": {"code": -32601, "message": f"method not found: {method}"}}


def main():
    root = os.environ.get("KG_VAULT_ROOT") or P.vault_root()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            resp = handle(root, msg)
        except Exception as e:  # noqa: BLE001 -- keep the server alive across a single bad request
            resp = {"jsonrpc": "2.0", "id": msg.get("id"),
                    "error": {"code": -32603, "message": f"internal error: {e}"}}
        if resp is not None:
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
