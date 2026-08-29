"""scripts/kg/eval_retrieval.py — `kg eval`: measured (not assumed) retrieval
comparison, per Spec 2 Phase C §2.6: "build a 10-question eval set ... and
show hybrid retrieval beats FTS-only on recall@10. If it doesn't, fix the
fusion weights before shipping."

Ground truth construction:

The spec's intended method is a hand-labeled eval set built from the vault's
own `question` notes (their `about` links name the notes that should support
an answer). That is exactly what this script does *when* question notes
exist. Genuinely hand-labeling "should this note support this answer" still
needs a person -- this script gives you that person's starting point: for
each open question, the gold set is the question's own `about` targets plus
those targets' immediate `evidence`/`supports` neighbors (the notes an
answer would obviously have to cite). Review/edit gold sets by hand before
trusting the numbers for anything beyond a smoke test -- printed clearly
below.

Fallback ground truth (used only when there are too few question notes to
form a meaningful eval set): for each source note, build a query from its
title and take every note with an `evidence` edge to that source as the gold
set. This is a structural proxy, not hand-labeling -- it measures "does
retrieval find the notes that cite this source," which is a real, useful,
but narrower question than the spec's intended one. Labeled as such in the
output so it's never mistaken for the real thing.
"""
import os, sys, argparse, json, time

sys.path.insert(0, os.path.dirname(__file__))
import parse as P
import retrieve as R

MIN_QUESTIONS_FOR_REAL_EVAL = 3
K = 10


def _question_based_eval_set(con):
    cases = []
    for row in con.execute("SELECT id, title FROM nodes WHERE note_type = 'question'"):
        about = [e["object"] for e in con.execute(
            "SELECT object FROM edges WHERE subject = ? AND predicate = 'about'", (row["id"],))]
        gold = set(about)
        for a in about:
            for e in con.execute(
                "SELECT object FROM edges WHERE subject = ? AND predicate IN ('evidence','supports')", (a,)):
                gold.add(e["object"])
        gold.discard(row["id"])
        if gold:
            cases.append({"query": row["title"], "gold": gold, "source_note": row["id"], "method": "question-about"})
    return cases


def _source_based_eval_set(con, limit=10):
    cases = []
    for row in con.execute("SELECT id, title FROM nodes WHERE note_type = 'source' ORDER BY id"):
        citing = {e["subject"] for e in con.execute(
            "SELECT subject FROM edges WHERE predicate = 'evidence' AND object = ?", (row["id"],))}
        if citing:
            cases.append({"query": row["title"], "gold": citing, "source_note": row["id"], "method": "source-evidence"})
        if len(cases) >= limit:
            break
    return cases


def recall_at_k(retrieved_ids, gold, k=K):
    top = set(retrieved_ids[:k])
    if not gold:
        return None
    return len(top & gold) / len(gold)


def run_eval(root, k=K):
    con = R.connect_ro(root)
    try:
        cases = _question_based_eval_set(con)
        method_note = None
        if len(cases) < MIN_QUESTIONS_FOR_REAL_EVAL:
            method_note = (f"only {len(cases)} question note(s) with resolvable `about` targets -- "
                            f"below the {MIN_QUESTIONS_FOR_REAL_EVAL} needed for a meaningful eval set. "
                            "Falling back to a source-citation proxy (see this script's docstring). "
                            "Create real `question` notes (Phase 4/6 growth loop) and re-run for the "
                            "measurement the spec actually asks for.")
            cases = _source_based_eval_set(con, limit=10)
        cases = cases[:10]

        rows = []
        for case in cases:
            lex = R.lexical_search(con, case["query"], k=30)
            sem, backend_name = R.semantic_search(root, con, case["query"], k=30)
            fused = R.reciprocal_rank_fusion([lex, sem]) if sem else lex
            lex_ids = [nid for nid, _s, _m in lex]
            hybrid_ids = [nid for nid, _s, _m in fused]
            rows.append({
                "query": case["query"], "source_note": case["source_note"], "method": case["method"],
                "gold_size": len(case["gold"]),
                "recall_fts_only": recall_at_k(lex_ids, case["gold"], k),
                "recall_hybrid": recall_at_k(hybrid_ids, case["gold"], k),
                "has_semantic": bool(sem),
            })
        return rows, method_note
    finally:
        con.close()


def main():
    ap = argparse.ArgumentParser(description="Measured retrieval eval: hybrid vs FTS-only recall@10 (Spec 2 §2.6)")
    ap.add_argument("--root", default=None)
    ap.add_argument("--k", type=int, default=K)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    root = args.root or P.vault_root()

    t0 = time.time()
    rows, note = run_eval(root, k=args.k)
    if not rows:
        print("no eval cases could be built (no question notes and no source/evidence edges found)")
        return 1

    if args.json:
        print(json.dumps({"note": note, "cases": rows}, indent=2, ensure_ascii=False))
        return 0

    if note:
        print(f"NOTE: {note}\n")
    print(f"{len(rows)} eval case(s), recall@{args.k}\n")
    print(f"{'query':<55} {'gold':>4} {'fts':>6} {'hybrid':>7}")
    fts_vals, hyb_vals = [], []
    for r in rows:
        fts = r["recall_fts_only"]
        hyb = r["recall_hybrid"]
        if fts is not None:
            fts_vals.append(fts)
        if hyb is not None:
            hyb_vals.append(hyb)
        print(f"{r['query'][:54]:<55} {r['gold_size']:>4} "
              f"{'' if fts is None else f'{fts:.2f}':>6} {'' if hyb is None else f'{hyb:.2f}':>7}")

    avg_fts = sum(fts_vals) / len(fts_vals) if fts_vals else None
    avg_hyb = sum(hyb_vals) / len(hyb_vals) if hyb_vals else None
    print()
    print(f"mean recall@{args.k}  fts-only: {avg_fts if avg_fts is None else round(avg_fts, 3)}   "
          f"hybrid: {avg_hyb if avg_hyb is None else round(avg_hyb, 3)}")
    if avg_fts is not None and avg_hyb is not None:
        if avg_hyb > avg_fts:
            print(f"PASS — hybrid beats FTS-only by {round(avg_hyb - avg_fts, 3)}")
        elif avg_hyb == avg_fts:
            print("FLAT — hybrid ties FTS-only (no embeddings contributed, or fusion weights need work)")
        else:
            print(f"FAIL — hybrid is WORSE than FTS-only by {round(avg_fts - avg_hyb, 3)}; "
                  "per spec §2.6, fix fusion weights before treating retrieval as shipped")
    elif not rows[0]["has_semantic"]:
        print("no embeddings available for this run (backend=none or unembedded) -- "
              "run `kg embed` first for a real hybrid-vs-FTS comparison")
    print(f"[{time.time()-t0:.2f}s]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
