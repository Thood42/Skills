# ADR 0001: Baseline architecture

- Status: Accepted
- Date: 2026-10-03

## Context

New internal VS Code extension. Optimizing for long-term maintainability by a team, enterprise
distribution through Azure DevOps, and agent-assisted development under gated reviews.

## Decision

- **Language/build:** TypeScript (strict), bundled by esbuild into `dist/`; `tsc` type-checks only.
- **Layers:** `core` (pure) ← `platform` (VS Code adapters) ← `features` ← `extension.ts`
  (composition root). Enforced by ESLint import restrictions and `tools/vsx-check.mjs`.
- **Tests:** mocha unit tests for `core` in plain Node; integration tests in a real Extension Host
  via `@vscode/test-cli`, against VS Code stable and the `engines.vscode` floor.
- **Engines floor:** `^1.110.0` (set explicitly at scaffold time). `@types/vscode` is pinned to the floor so
  the compiler rejects newer APIs.
- **Surfaces enabled at bootstrap:** core only (commands, settings, log).
- **Packaging:** `.vscodeignore` is an allowlist; `vsce package --no-dependencies`.
- **CI/CD:** Azure Pipelines (`azure-pipelines.yml`): validate on PRs; tags `v*` package, wait for
  approval on environment `part-lookup-release`, publish universal package `acme-devtools.part-lookup` to
  `DevTools/vscode-extensions`.
- **Gates:** features follow the four-gate plan in `docs/plans/`; every slice and release passes a
  best-practice review gate recorded in `docs/reviews/`.

## Consequences

- VSIX installs do not auto-update. If the org adopts the VS Code Private Marketplace, switch the
  publish stage to its Azure Artifacts (npm feed) flow and users get auto-update.
- Proposed APIs are unavailable (stable VS Code only).
- The extension host Node version caps the esbuild `NODE_TARGET`; revisit when raising the floor.
