# Azure DevOps: pipeline, feeds, distribution

## Contents
- Distribution options
- One-time setup
- Pipeline anatomy (azure-pipelines.yml)
- Internal npm registry
- Universal Packages details
- Release channels with feed views
- Installing and updating
- Private Marketplace (auto-update)
- Troubleshooting

## Distribution options

| Option | Auto-update | Needs | Use when |
| --- | --- | --- | --- |
| **Universal Package** per release in an Azure Artifacts feed (baseline default) | No — users re-run the install script | Azure Artifacts feed, Azure CLI on dev machines | Default for internal extensions |
| **VS Code Private Marketplace** backed by an Azure Artifacts **npm** feed | Yes, like the public Marketplace | GitHub Enterprise (users sign in with GHE / Copilot Business-Enterprise), a hosted container, a managed identity | The organization already runs (or will run) the Private Marketplace |
| Pipeline artifact only | No | Nothing | Internal testing builds, never for distribution |

Organizations can additionally restrict what users may install with the `extensions.allowed`
policy (VS Code 1.96+); internal extensions need their publisher or ID on that allow-list.

## One-time setup

1. **Feed**: create (or reuse) an Azure Artifacts feed, project-scoped unless the org standard
   is organization-scoped (`--feed-scope`).
2. **Permissions**: Feed settings → Permissions → add `<Project> Build Service (<org>)` and
   `Project Collection Build Service (<org>)` as **Feed Publisher (Contributor)**.
   Consumers need **Feed Reader**.
3. **Pipeline**: Pipelines → New → Azure Repos Git → existing YAML → `azure-pipelines.yml`
   (or `az pipelines create --name <name> --yml-path azure-pipelines.yml`).
4. **Release environment**: Pipelines → Environments → `<name>-release` → Approvals and
   checks → Approvals. This approval is the human sign-off of the release gate; without it,
   any tag publishes immediately.
5. **Branch policy** (recommended): require the pipeline's Validate stage on PRs to `main`.

## Pipeline anatomy (azure-pipelines.yml)

| Stage | Runs on | Does |
| --- | --- | --- |
| Validate | every PR and push; matrix ubuntu + windows | `npm ci`, types, lint, `check:extension --gate slice`, unit tests, integration tests (Linux under `xvfb-run -a`) |
| Package | tags `v*` | tag equals `package.json` version, `check:extension --gate release`, floor integration tests, `vsce package --no-dependencies` → pipeline artifact `vsix` |
| Publish | tags `v*`, deployment job on environment `<name>-release` | waits for approval, `UniversalPackages@0` publishes the VSIX as `<publisher>.<name>` version `x.y.z` |

Notes:

- `nodeVersion` is the toolchain Node (vsce and test-cli need ≥22), unrelated to the extension
  host's Node.
- The Windows leg catches path-separator and line-ending bugs; keep it unless pipeline minutes
  are scarce.
- Publishing needs no PAT: the pipeline identity has Feed Publisher.

## Internal npm registry

If npm packages must come from an Azure Artifacts feed with an npmjs upstream, commit an
`.npmrc` with only the registry line:

```ini
registry=https://pkgs.dev.azure.com/<org>/<project>/_packaging/<npm-feed>/npm/registry/
always-auth=true
```

and uncomment the `npmAuthenticate@0` step in each stage. Developers authenticate locally with
the feed's "Connect to feed" instructions. Never commit tokens.

## Universal Packages details

- Name: lowercase letters, digits, `-` (not doubled), `_`, `.`; the scaffold derives
  `<publisher>.<name>`.
- Version: SemVer 2.0 without `+build` metadata; the extension version is used as-is.
- Versions are immutable: never delete-and-republish; ship a new PATCH.
- CLI: `az artifacts universal publish|download --organization https://dev.azure.com/<org>
  [--project <p> --scope project] --feed <feed> --name <pkg> --version <v> --path <dir>`
  (requires `az extension add --name azure-devops`).

## Release channels with feed views

Every publish lands in the feed's `@Local` view. Promote a version to `@Prerelease` for a
pilot group, then `@Release` for everyone (Artifacts → package → Promote; Feed Publisher
needed; promotion cannot be undone). Consumers select a view as `<feed>@<view>`; confirm that
`az artifacts universal download --feed <feed>@Release` resolves in your organization before
pointing the install scripts at a view.

## Installing and updating

`scripts/install-extension.sh` / `.ps1` download the package (default latest, or a given
version) with the Azure CLI and run `code --install-extension <vsix> --force`. Use
`CODE_CLI=code-insiders` (or `-CodeCli`) for Insiders. Users need Feed Reader and `az login`
(or `AZURE_DEVOPS_EXT_PAT`).

VS Code does not auto-update VSIX installs. Options: announce releases where users work; add a
"check for updates" command that compares `ctx.version` with the feed (needs the user's
Azure credentials — usually not worth it); or move to the Private Marketplace.

## Private Marketplace (auto-update)

When the organization runs the VS Code Private Marketplace with Azure Artifacts as its source:

- The source is an Azure Artifacts **npm** feed (not Universal Packages) that the marketplace
  container reads with a managed identity (Feed Reader).
- Publish each VSIX with Microsoft's `Publish-VsixToAzureArtifacts.ps1` (from the
  `microsoft/vsmarketplace` repository, `privatemarketplace/latest/`):
  `./Publish-VsixToAzureArtifacts.ps1 -VsixFilePath <vsix> -DestinationFeed https://pkgs.dev.azure.com/<org>/_packaging/<feed>/npm/registry/`.
  It needs PowerShell 7 and Packaging Read & Write on the feed.
- In a pipeline: the script authenticates with `vsts-npm-auth` (interactive, Windows) unless an
  authenticated `.npmrc` already exists where it looks. Running `npmAuthenticate@0` against a
  pre-written `.npmrc` first should let it skip that step — GUESS, verify against the current
  script before relying on it.
- Users point VS Code at the marketplace through the `ExtensionGalleryServiceUrl` policy; they
  then install and auto-update from the Extensions view.

Record the switch in an ADR (it changes the distribution decision in ADR 0001) and replace
the Publish stage's `UniversalPackages@0` task with the script.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `UniversalPackages@0` 403 | Build identities lack Feed Publisher on the feed |
| Publish ran without approval | No Approvals check on the `<name>-release` environment |
| Package stage fails "Tag … does not match" | Tag pushed before bumping `package.json`; delete the tag, bump, retag |
| `vsce` hangs | Missing `repository`/LICENSE prompt (MAN-013) |
| Integration tests hang on Linux | Missing `xvfb-run -a` |
| `az artifacts universal download` asks to log in | Run `az login` or set `AZURE_DEVOPS_EXT_PAT` |
