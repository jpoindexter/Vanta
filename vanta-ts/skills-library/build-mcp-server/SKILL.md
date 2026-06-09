---
name: build-mcp-server
description: "Scaffold a new MCP server from a tool description, build it, and mount it into the active Vanta session."
---

# Build MCP Server

Use this skill when the user wants to expose a capability as an MCP tool — something Vanta or Claude Code can call. The output is a working TypeScript MCP server, built and mounted in one shot.

Trigger phrases: "make a tool for X", "build an MCP that does Y", "expose Z as an MCP", "create an MCP server", "I need a tool that".

## What you'll produce

A minimal TypeScript MCP server that:
1. Implements one or more tools described by the user
2. Builds cleanly (`npm run build`)
3. Mounts into the active session via `mount_mcp`

---

## Step 1 — Clarify the tool contract

Before writing code, get clarity on:
- **Tool name** (snake_case, e.g. `fetch_weather`)
- **Input schema** — what params does it need? Types? Required vs optional?
- **Output** — what does it return and in what format?
- **Side effects** — does it write files, call external APIs, spawn processes?

If the user gave you enough, proceed. If not, ask these as concrete questions with examples.

---

## Step 2 — Scaffold the project

```bash
mkdir ~/tmp/<server-name> && cd ~/tmp/<server-name>
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
npx tsc --init --module nodenext --target es2022 --outDir dist --rootDir src --strict
mkdir src
```

---

## Step 3 — Write `src/index.ts`

Minimal pattern — expand for each tool:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "<server-name>", version: "0.1.0" });

server.tool(
  "<tool_name>",
  "<description of what the tool does>",
  {
    // Zod schema for inputs
    param1: z.string().describe("what param1 is"),
    param2: z.number().optional().describe("optional numeric param"),
  },
  async ({ param1, param2 }) => {
    // Implementation
    const result = `processed: ${param1}`;
    return {
      content: [{ type: "text", text: result }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Step 4 — Build

```bash
npx tsc
```

Fix any TypeScript errors before proceeding. Common issues:
- Missing `"moduleResolution": "bundler"` or `"nodenext"` in tsconfig
- Import paths need `.js` extension in ESM output

---

## Step 5 — Mount into Vanta

Use the `mount_mcp` tool:

```
mount_mcp({
  name: "<server-name>",
  command: "node",
  args: ["~/tmp/<server-name>/dist/index.js"]
})
```

The tool will:
1. Spawn the server process
2. Initialize the MCP connection
3. Register all discovered tools into the active registry
4. Return the list of tool names now available

---

## Step 6 — Verify

Call one of the newly mounted tools with a simple test case. Confirm the output is what you expected. If the tool fails, read the error, fix `src/index.ts`, rebuild, and `mount_mcp` again (re-mounting replaces the old registration).

---

## Constraints

- **No deps beyond `@modelcontextprotocol/sdk` and `zod`** unless the tool genuinely needs them. Every dep is a maintenance burden.
- **All inputs validated with Zod** — MCP inputs are external, treat them as untrusted.
- **Return `{ content: [{ type: "text", text: "..." }] }`** — the standard MCP text response shape.
- **Errors as text, not throws** — catch errors inside the tool handler and return them as content, so the caller gets a useful message instead of a protocol error.
- **stdio transport only** — that's what Vanta's `mount_mcp` and `stdioTransport` speak.
