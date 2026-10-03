<#
.SYNOPSIS
Installs or updates {{DISPLAY_NAME}} from Azure Artifacts.

.DESCRIPTION
Requires the Azure CLI with the azure-devops extension (az extension add --name azure-devops),
az login (or $env:AZURE_DEVOPS_EXT_PAT), read access to the feed, and the VS Code CLI on PATH.

.EXAMPLE
./scripts/install-extension.ps1
./scripts/install-extension.ps1 -Version 1.2.0 -CodeCli code-insiders
#>
param(
  [string]$Version = '*',
  [string]$CodeCli = 'code'
)
$ErrorActionPreference = 'Stop'

$org = 'https://dev.azure.com/{{ADO_ORG}}'
$feed = '{{ADO_FEED}}'
$feedProject = '{{FEED_PROJECT}}'  # empty for an organization-scoped feed
$package = '{{UPKG_NAME}}'

$scopeArgs = if ($feedProject) { @('--project', $feedProject, '--scope', 'project') } else { @('--scope', 'organization') }

$work = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  az artifacts universal download --organization $org @scopeArgs `
    --feed $feed --name $package --version $Version --path $work
  if ($LASTEXITCODE -ne 0) { throw "az artifacts universal download failed (exit $LASTEXITCODE)" }

  $vsix = Get-ChildItem -Path $work -Filter '*.vsix' | Select-Object -First 1
  if (-not $vsix) { throw "No .vsix found in $package@$Version" }

  & $CodeCli --install-extension $vsix.FullName --force
  if ($LASTEXITCODE -ne 0) { throw "VS Code CLI failed (exit $LASTEXITCODE)" }
  Write-Host "Installed $($vsix.Name)"
}
finally {
  Remove-Item -Recurse -Force -Path $work
}
