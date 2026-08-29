# Retrieval

What `kg` actually does when you ask it a question, and which command to reach for.

**The headline rule: an agent working in one of these vaults calls `kg context`, not grep.** That is the whole reason the retrieval layer exists. Grep finds string matches in whichever files you thought to look in; `kg context` returns a token-budgeted, provenance-carrying pack assembled from lexical hits, semantic neighbours, graph expansion and cluster summaries.

---

## The command surface, and when each earns its keep

| Command | Reach for it when |
|---|---|
| `kg context "<q>" [--budget 8000]` | **Default.** You are about to answer a question, write a note, or brief a subagent, and you need what the vault already knows. |
| `kg search "<q>" [--k] [--type] [--hops]` | You want ranked note *identities*, not prose — deciding what to open, or checking whether something is already covered before writing it. |
| `kg neighbors <note> [--predicate] [--depth]` | You are working on one note and need its typed surroundings. `--predicate evidence` answers "what is this actually based on?" |
| `kg path <a> <b> [--max-hops]` | "How are these two things connected?" Returns the hop chain with predicates and directions. |
| `kg subgraph <note> [--depth] [--format md\|mermaid\|canvas]` | You need a *picture* — a Mermaid block for a community note, a Canvas for the user. |
| `kg gaps` / `kg contradictions` | Phase 6/7 work selection, not question answering. |
| `kg eval` | Measuring whether hybrid retrieval actually beats lexical on this corpus. |

Seven of these are also served over MCP through the project's `.mcp.json`, so a fresh `cd project && claude` has them as tools without any setup.

---

## How `kg context` assembles a pack

1. **Lexical.** FTS5 BM25 over title + body → top 30.
2. **Semantic.** Cosine over note embeddings → top 30. Skipped if nothing is embedded.
3. **Fuse.** Reciprocal-rank fusion (`k=60`) over both ranked lists → top *k* seeds. RRF is used rather than score blending because BM25 and cosine scores are not on a comparable scale, and rank is.
4. **Graph expansion.** One hop from each seed (two for `question` seeds), weighted by predicate — `evidence` 1.0, `supports` / `contradicts` 0.9, `answers` 0.85, down to `about` 0.5. An evidential edge tells you more about relevance than a topical one.
5. **Community lift.** Attach the generated `community` summary note for each seed's cluster. This is the global-vs-local GraphRAG split: the summaries carry what a cluster *means*, which no individual note states.
6. **Assemble under budget**, in this order: community summaries → claims (with confidence) → concepts → questions → entities → sources. Roughly 4 chars per token.
7. **Emit** markdown where every block carries its `source_id`, `confidence` and `evidence`, so anything written from the pack is citable by construction.

### Degradation is explicit, always

Every `search` and `context` result carries a `"mode"` field, and when degraded a `"lexical_only_reason"`. There are three honest states:

- `hybrid` — embeddings present, all six steps ran.
- `lexical-only` — no embeddings on disk, or no backend reachable at query time. FTS + graph expansion still work and are genuinely useful. Say which mode you are in when you report findings.
- No community summaries yet → step 5 falls back to shared tags across the seeds, **labelled as a stand-in** in the output.

This is deliberate. A retrieval layer that quietly returns worse results is worse than one that says it is degraded.

---

## Embeddings

```bash
python3 -m scripts.kg embed          # changed notes only
python3 -m scripts.kg embed --all    # force re-embed
```

Content-hashed and incremental: only notes whose body changed are re-embedded, and existing vectors are **carried forward across every full `graph.sqlite` rewrite**. That carry-forward is load-bearing rather than an optimization — the FUSE-mount workaround (`hardening-ledger.md` F1) recreates the schema on every build, so without it every `kg build` would silently discard the whole index.

**Backend chain:** LM Studio at `127.0.0.1:1234/v1/embeddings` → `fastembed` (downloads a local model once) → none. Each failure is printed by name.

**The failure you will actually hit:** a cloud session's shell is network-isolated from the user's own machine's localhost, so LM Studio is unreachable from it even while running perfectly on their desktop, and a `huggingface.co` download may be blocked by the egress allowlist on top of that. This is an environment constraint, not a misconfiguration, and not something to debug in code. The fix is one command from a real terminal on the user's machine:

```bash
cd <vault> && python3 -m scripts.kg embed
```

Everything downstream reads whatever is in `graph.sqlite`, regardless of which environment computed it. `kg doctor`'s section 4 reports embedding coverage as a percentage, so you can always tell.

---

## Measuring, not assuming

```bash
python3 -m scripts.kg eval
```

Builds a gold set from the vault's `question` notes and their `about` targets, then reports mean recall@10 for FTS-only versus hybrid. It needs at least three question notes to be meaningful, and it needs embeddings — with zero embedded notes the two numbers are identical by construction, which is a measurement artifact and not a finding about fusion.

If you report a recall number, report which mode produced it. "FTS 0.29, hybrid 0.29, because nothing was embedded yet" is a useful, honest thing to say; "hybrid retrieval works well" without that context is not.

---

## Writing back

Retrieval is read-only. `retrieve.py` opens the database `mode=ro&immutable=1`, which also sidesteps the FUSE mount's missing byte-range locking for readers entirely.

When the user's vault is **open in Obsidian** and Local REST API is installed, prefer that plugin's endpoint for writes — the user watches notes appear, and you can open the note you just wrote in their UI. When the vault is closed, write to the filesystem. Never do both in one session.
