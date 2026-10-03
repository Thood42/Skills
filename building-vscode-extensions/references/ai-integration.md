# AI integration: tools, chat participants, MCP, language models

## Contents
- Choosing the mechanism
- Language model tools (recipe)
- Chat participants (recipe)
- MCP server definition providers (recipe)
- Calling models directly (vscode.lm)
- Enterprise guardrails
- Testing

## Choosing the mechanism

| Need | Use | Why |
| --- | --- | --- |
| Agent mode should call your capability on its own, with VS Code API access | **Language model tool** (`vscode.lm.registerTool`) | Runs in the extension host; distributed with the extension |
| The capability must also work outside VS Code (other agents/IDEs) or runs as a service | **MCP server**, registered through `vscode.lm.registerMcpServerDefinitionProvider` | One server, many clients; the extension only tells VS Code how to start/reach it |
| A domain assistant users address as `@name`, owning the whole conversation | **Chat participant** (`vscode.chat.createChatParticipant`) | Full control of prompts and responses |
| AI inside a non-chat feature (code action, hover, view) | **`vscode.lm.selectChatModels` + `sendRequest`** | Direct model access |

Prefer a tool over a participant when users already work in agent mode; most capability
requests ("let Copilot look up part numbers") are tools.

## Language model tools (recipe)

Manifest (`contributes.languageModelTools`):

```json
{
  "name": "part_lookup_find_part",
  "toolReferenceName": "findPart",
  "displayName": "Find Part",
  "userDescription": "Look up an internal part by number or name.",
  "modelDescription": "Searches the workspace part catalog (parts.json) by part number or name and returns up to 20 matches with number, name and status. Use when the user mentions a part number (format A-123) or asks which part fits a description. Read-only. Does not know prices or stock.",
  "canBeReferencedInPrompt": true,
  "icon": "$(search)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Part number (e.g. A-100) or words from the part name." }
    },
    "required": ["query"]
  }
}
```

Implementation: logic in `src/core` (plain data in, text out), adapter in
`src/features/<name>/`:

```ts
interface FindPartInput { readonly query: string }

function isFindPartInput(value: unknown): value is FindPartInput {
  return typeof value === 'object' && value !== null && typeof (value as { query?: unknown }).query === 'string';
}

class FindPartTool implements vscode.LanguageModelTool<FindPartInput> {
  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<FindPartInput>): vscode.PreparedToolInvocation {
    return { invocationMessage: `Searching parts for "${options.input.query}"` };
    // Side effects? also return confirmationMessages: { title, message: new vscode.MarkdownString(...) }
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<FindPartInput>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    if (!isFindPartInput(options.input)) {
      throw new Error('Expected {"query": string}. Retry with the part number or name as "query".');
    }
    const catalog = await loadCatalog(token);           // feature/platform: workspace.fs
    const text = formatMatches(searchParts(catalog, options.input.query)); // core
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }
}

// register(ctx): ctx.extension.subscriptions.push(vscode.lm.registerTool('part_lookup_find_part', new FindPartTool()));
```

Rules that matter (AI-J02..J05):

- **Validate input at runtime** — the schema guides the model; it does not guarantee shape.
- **Errors are instructions**: thrown messages reach the model; say what to do next.
- **Bound the output** (cap results, truncate long text) and keep it plain and deterministic.
- **Confirm side effects**: any tool that writes, runs, or sends returns
  `confirmationMessages`; read-only tools say "Read-only" in `modelDescription`.
- Names: `<extension>_<verb>_<noun>` (AI-005); `toolReferenceName` is the `#name` users type.

## Chat participants (recipe)

```json
"chatParticipants": [{
  "id": "partLookup.assistant",
  "name": "parts",
  "fullName": "Part Lookup",
  "description": "Ask about internal part numbers",
  "isSticky": true,
  "commands": [{ "name": "find", "description": "Find a part by number or name" }]
}]
```

```ts
const handler: vscode.ChatRequestHandler = async (request, _context, stream, token) => {
  if (request.command === 'find') {
    stream.progress('Searching the catalog...');
    stream.markdown(formatMatches(searchParts(await loadCatalog(token), request.prompt)));
    return {};
  }
  const messages = [
    vscode.LanguageModelChatMessage.User('You answer questions about internal part numbers. Be brief.'),
    vscode.LanguageModelChatMessage.User(request.prompt),
  ];
  try {
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }
  } catch (error) {
    if (error instanceof vscode.LanguageModelError) {
      stream.markdown(`The language model is unavailable (${error.code}). Try /find instead.`);
      return {};
    }
    throw error;
  }
  return {};
};

const participant = vscode.chat.createChatParticipant('partLookup.assistant', handler);
participant.iconPath = vscode.Uri.joinPath(ctx.extension.extensionUri, 'media', 'icon.png');
ctx.extension.subscriptions.push(participant);
```

Use `request.model` (the model the user picked) rather than selecting one yourself.

## MCP server definition providers (recipe)

```json
"mcpServerDefinitionProviders": [{ "id": "partLookup.mcp", "label": "Part Lookup" }]
```

```ts
const changed = new vscode.EventEmitter<void>();
ctx.extension.subscriptions.push(
  changed,
  vscode.lm.registerMcpServerDefinitionProvider('partLookup.mcp', {
    onDidChangeMcpServerDefinitions: changed.event,
    provideMcpServerDefinitions: () => [
      // positional: label, command, args?, env?, version?
      new vscode.McpStdioServerDefinition('Part Lookup', 'node', [vscode.Uri.joinPath(ctx.extension.extensionUri, 'dist', 'mcp-server.js').fsPath], {}, ctx.version),
      // or remote: label, uri, headers?, version?
      // new vscode.McpHttpServerDefinition('Part Lookup', vscode.Uri.parse('https://parts.internal.example/mcp'), {}, ctx.version),
    ],
    resolveMcpServerDefinition: async (server) => server, // authenticate / fill secrets here, just before start
  }),
);
```

Fire `changed` when settings that affect the definition change. Bump `version` when the
server's tool list changes so VS Code refreshes it. Secrets go in at `resolve` time from
`context.secrets`, never into settings or the definition list.

## Calling models directly (vscode.lm)

```ts
const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot' });
if (!model) {
  // No model: not signed in, Copilot disabled by policy, or no consent yet. Degrade, don't throw.
  return fallbackWithoutAi();
}
const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
```

The first request triggers a consent prompt; call it only from a user action. Handle
`vscode.LanguageModelError` (`NoPermissions`, `Blocked`, `NotFound`) explicitly.

## Enterprise guardrails

- **Data leaving the machine** (SEC-J01): list in the Architecture doc and README exactly what
  each tool or prompt sends to a model; workspace content in a prompt goes to the model
  provider configured by the organization. Never put secrets or tokens into prompts or tool
  results.
- **Policy**: organizations can disable chat or restrict models; every AI path needs a non-AI
  outcome or a clear message (AI-J05).
- **Side effects** require confirmation (AI-J02); destructive operations should not be tools.
- **Telemetry**: none by default; if added, respect `vscode.env.isTelemetryEnabled` and
  document it.

## Testing

- Unit-test the core functions behind each tool/participant (plain text in/out).
- Integration: assert `vscode.lm.tools` contains every contributed tool and call
  `vscode.lm.invokeTool(name, { input, toolInvocationToken: undefined })` to test the real
  adapter (no model needed).
- Model-dependent paths cannot be asserted deterministically; test the no-model branch and
  the prompt construction (core) instead.
