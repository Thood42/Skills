# Part Lookup

Look up internal part numbers.

## Features

- **Part Lookup: Show Log** — opens this extension's log in the Output panel.

## Install

Internal distribution via Azure Artifacts (feed `DevTools/vscode-extensions`). You need the
Azure CLI with the `azure-devops` extension and read access to the feed.

```bash
# macOS / Linux
./scripts/install-extension.sh            # latest
./scripts/install-extension.sh 1.2.0      # specific version
```

```powershell
# Windows
./scripts/install-extension.ps1
./scripts/install-extension.ps1 -Version 1.2.0
```

Re-run the script to update; VS Code does not auto-update extensions installed from a VSIX.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `partLookup.greeting` | `Hello` | Greeting used by the Hello World command. |

## Support

Open **Part Lookup: Show Log** and attach the output when reporting an issue.
