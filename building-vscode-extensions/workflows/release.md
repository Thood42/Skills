# Release: version, gate, publish to Azure Artifacts

```
Release progress:
- [ ] 1. Decide the version
- [ ] 2. Prepare CHANGELOG, README, version
- [ ] 3. Release gate (mechanical + judgment)
- [ ] 4. User approval, then tag
- [ ] 5. Pipeline publishes after the environment approval
- [ ] 6. Tell users how to update
```

## 1. Decide the version

`MAJOR.MINOR.PATCH` only — VSIX versions cannot carry `-beta` or `+build` suffixes.

| Change | Bump |
| --- | --- |
| Removed or renamed command, setting, tool, view; changed setting semantics | MAJOR |
| New capability; raised `engines.vscode` floor (users on older VS Code stop receiving updates — confirm the fleet first) | MINOR |
| Fixes, performance, docs | PATCH |

Pre-release testing uses feed **views**, not version suffixes: every publish lands in the
feed's `@Local` view; testers install from it; promote the same version to `@Prerelease` /
`@Release` in Azure Artifacts once it has soaked. Promotion cannot be undone, and the same
version can never be republished — fix forward with a new PATCH.

## 2. Prepare

- Move `## [Unreleased]` notes under `## [x.y.z] - <date>`; leave an empty `[Unreleased]`.
- Set `version` in `package.json` (`npm version x.y.z --no-git-tag-version`).
- README: settings table and feature list match `package.json`; no reference features left.
- Reference features (`hello`, panel, AI samples) must be gone before the first release.

## 3. Release gate

```bash
node scripts/gate.mjs --gate release --repo <repo>
```

Adds the engines-floor integration run and VSIX content inspection; majors block. Then apply
the judgment rules tagged `release` (`references/review-rubric.md`), in particular:
REL-J01 changelog accuracy against the diff since the last tag, REL-J02 migration of stored
state, REL-J03 breaking-change notes, SEC-J01 data leaving the machine is documented.

## 4. Approve and tag

Present the verdict and the version decision. On approval:

```bash
git tag v<x.y.z> && git push origin v<x.y.z>
```

Only tag when the user says so; tags trigger publishing.

## 5. Pipeline

`azure-pipelines.yml` on a `v*` tag: Validate → Package (tag must equal `package.json`
version, release gate, floor tests, `vsce package`) → Publish (waits for the Approvals check
on the `<name>-release` environment, then `UniversalPackages@0` publishes the VSIX). Details
and one-time setup: `references/azure-devops.md`.

## 6. Users update

```bash
./scripts/install-extension.sh            # latest
./scripts/install-extension.sh 1.4.2      # pin or roll back
```

VSIX installs do not auto-update. If the organization runs the VS Code Private Marketplace
(GitHub Enterprise), switch publishing to its Azure Artifacts npm-feed flow so users get
auto-update (`references/azure-devops.md`, "Private Marketplace").

Rollback = users reinstall the previous version with the script; then ship a fixed PATCH.

## Public marketplaces (only if asked)

Out of scope for internal distribution. If the user later needs the VS Code Marketplace,
use `vsce publish --azure-credential` with Microsoft Entra workload identity from the
pipeline (global Azure DevOps PATs are being retired); Open VSX uses `npx ovsx publish`
with a token. Both reject proposed APIs and require the release gate to pass.
