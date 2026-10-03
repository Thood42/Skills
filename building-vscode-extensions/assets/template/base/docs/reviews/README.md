# Review gates

Each gate leaves a report here: `YYYY-MM-DD-<gate>[-<slug>].md`.

| Gate | When | Blocks on |
| --- | --- | --- |
| baseline | repo created or adopted | blockers |
| plan-1..3 | software-factory Gates 1–3 (design docs) | blockers |
| slice | end of every vertical slice / PR | blockers |
| release | before tagging `v<version>` | blockers + majors |

Mechanical checks: `npm run check:extension -- --gate <gate>` (rule IDs match the rubric).

## Waivers

A blocker can be waived only by an explicit human decision, recorded in `waivers.json`:

```json
{
  "waivers": [
    {
      "rule": "ARC-004",
      "path": "src/features/import/legacyReader.ts",
      "reason": "Synchronous read of a <1 KB marker file during a user-invoked command; replacing it is tracked in #123.",
      "approvedBy": "jane.doe",
      "date": "2026-10-01",
      "expires": "2027-01-01"
    }
  ]
}
```

`path` is optional (omit to waive the rule repo-wide). Expired waivers stop applying, so the
finding resurfaces instead of becoming permanent debt.
