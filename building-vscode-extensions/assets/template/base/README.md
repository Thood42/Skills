# {{DISPLAY_NAME}}

{{DESCRIPTION}}

## Features

- **{{DISPLAY_NAME}}: Show Log** — opens this extension's log in the Output panel.

## Install

Internal distribution via Azure Artifacts (feed `{{ADO_PROJECT}}/{{ADO_FEED}}`). You need the
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
| `{{ID}}.greeting` | `Hello` | Greeting used by the Hello World command. |

## Support

Open **{{DISPLAY_NAME}}: Show Log** and attach the output when reporting an issue.
