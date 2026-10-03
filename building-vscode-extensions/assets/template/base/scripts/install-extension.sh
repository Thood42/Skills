#!/usr/bin/env bash
# Installs or updates {{DISPLAY_NAME}} from Azure Artifacts.
#
# Requires: Azure CLI with the azure-devops extension (`az extension add --name azure-devops`),
# `az login` (or AZURE_DEVOPS_EXT_PAT set), read access to the feed, and the VS Code CLI on PATH.
#
# Usage: ./scripts/install-extension.sh [version]      (default: latest)
#        CODE_CLI=code-insiders ./scripts/install-extension.sh
set -euo pipefail

ORG="https://dev.azure.com/{{ADO_ORG}}"
FEED="{{ADO_FEED}}"
FEED_PROJECT="{{FEED_PROJECT}}"   # empty for an organization-scoped feed
PACKAGE="{{UPKG_NAME}}"
VERSION="${1:-*}"
CODE_CLI="${CODE_CLI:-code}"

scope_args=(--scope organization)
if [[ -n "$FEED_PROJECT" ]]; then
  scope_args=(--project "$FEED_PROJECT" --scope project)
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

az artifacts universal download \
  --organization "$ORG" "${scope_args[@]}" \
  --feed "$FEED" --name "$PACKAGE" --version "$VERSION" --path "$workdir"

vsix="$(find "$workdir" -maxdepth 1 -name '*.vsix' | head -n 1)"
if [[ -z "$vsix" ]]; then
  echo "No .vsix found in $PACKAGE@$VERSION" >&2
  exit 1
fi

"$CODE_CLI" --install-extension "$vsix" --force
echo "Installed $(basename "$vsix")"
