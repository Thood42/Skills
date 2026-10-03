# Maintain: dependency updates, floor raises, health checks

Use for upkeep that is not a feature: "update our dependencies", "bump the VS Code version",
"is this extension still healthy", or a periodic check. Small, separate changes; each ends with
the slice gate.

```
Maintain progress:
- [ ] 1. Health report
- [ ] 2. Vendored checker current
- [ ] 3. Dependencies (one group per change)
- [ ] 4. engines floor (only if the fleet or a needed API justifies it)
- [ ] 5. Waivers and follow-ups
```

## 1. Health report

```bash
node scripts/vsx-check.mjs <repo> --gate release     # what would block a release today
npm outdated                                          # in the repo
```

Summarize: release blockers, expiring waivers (`docs/reviews/waivers.json`), outdated
packages grouped as below, and the gap between `engines.vscode` and the fleet.

## 2. Vendored checker

If `tools/vsx-check.mjs` differs from the skill's `scripts/vsx-check.mjs` (compare
`CHECKER_VERSION`), copy it over in its own change; new findings it surfaces are reported, not
silently waived.

## 3. Dependencies

Update in groups, each its own change with the slice gate, so a break points at one group.
The compatibility rules are the same ones the scaffold applies:

| Group | Rule |
| --- | --- |
| `typescript` + `typescript-eslint` + `eslint` + `@eslint/js` | `typescript` must satisfy typescript-eslint's peer range (`npm view typescript-eslint peerDependencies`); `@eslint/js` major = `eslint` major. A new TypeScript major is adopted only once typescript-eslint supports it. |
| `@vscode/test-cli` + `@vscode/test-electron` + `mocha` + `@types/mocha` | `mocha` and `@types/mocha` follow the ranges `@vscode/test-cli` depends on (`npm view @vscode/test-cli dependencies`), so one mocha instance serves both suites. |
| `esbuild`, `@vscode/vsce`, `@vscode/test-web` | Latest; re-check `npx vsce ls --no-dependencies` after a vsce major. |
| `@types/vscode` | Never independently: it moves only with the engines floor (step 4). |
| `@types/node` | Major = the Node major of the extension host at the floor (with `NODE_TARGET` in `esbuild.mjs`). |
| Runtime `dependencies` | Read changelogs; they ship to users. |

Use `npm install -D <pkg>@<version>` (not `npm update` across the board) and commit
`package-lock.json` with the change.

## 4. engines floor

Raise it when the oldest VS Code in the fleet has moved, or when a needed API requires it:

1. Confirm the fleet minimum with the user (it is a product decision: older installs stop
   receiving updates).
2. Set `engines.vscode` to `^x.y.0`; pin `@types/vscode` to the newest published version ≤ the
   floor (`npm view @types/vscode versions`).
3. Check whether the new floor's VS Code ships a newer Node; if so, raise `NODE_TARGET` in
   `esbuild.mjs` and `@types/node` together.
4. Record an ADR (supersede ADR 0001's floor line); MINOR version bump at release.
5. Run `npm run test:integration:floor` plus the slice gate.

## 5. Waivers and follow-ups

Expired waivers resurface as findings automatically. For each, fix it or ask the user for a
renewed waiver with a new expiry and reason; never extend one silently.
