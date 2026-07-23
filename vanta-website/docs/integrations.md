---
id: integrations
title: Editor & API integrations
sidebar_position: 3
---

# Editor & API integrations

Beyond [MCP](./mcp.md), Vanta exposes two local servers so other tools can use it — both locally bound and kernel-gated.

## Service integrations

`vanta integrations` reports the same honest state in the CLI, TUI (`/integrations`), and Desktop Connect > MCP:

- **Needs setup** — no usable credential or connector is present.
- **Installed** — a credential or pack is saved, but its live connection has not been verified.
- **Ready** — a bounded read-only test passed and a redacted receipt was recorded.
- **Needs attention** — the most recent verification failed; reconnect before using it.

Run a bounded test or an explicit pack action with:

```bash
vanta integrations test trello
vanta integrations install box
vanta integrations configure dropbox
```

Trello and Dropbox keep reads and writes separate. Set the read credentials first (`VANTA_TRELLO_KEY` + `VANTA_TRELLO_TOKEN`, or `VANTA_DROPBOX_TOKEN`); add `VANTA_TRELLO_WRITE_TOKEN` or `VANTA_DROPBOX_WRITE_TOKEN` only when you intend to mutate remote data. Every write still asks for normal Vanta approval. Trello updates also require the card's current `dateLastActivity`, and Dropbox replacements require the file revision, so stale remote content is never silently overwritten.

Box and Atlassian Rovo are hosted MCP packs. Install them explicitly, review the discovered tools and resources, then trust, authorize, and test them in the MCP panel before mounting tools. A locally saved credential alone never labels a service ready.

## Agent Client Protocol (editors)

Expose the agent loop over HTTP/JSON-RPC so an editor (e.g. Zed) can send instructions and receive responses:

```bash
vanta acp [port]      # default 7792
```

It writes an `agent.json` capability registry at the repo root and serves:

- `GET /` — the capability registry
- `POST /run` — execute an instruction, return the response
- `GET /status` — health

Every action still goes through the kernel — the editor can't do anything the agent couldn't.

## OpenAI-compatible proxy

Let any tool that speaks the OpenAI API use Vanta's configured model/subscription:

```bash
vanta proxy [port]    # default 7791
```

It serves `/v1/chat/completions` and `/v1/models`, routing through Vanta's provider layer. Point an external tool at it:

```bash
OPENAI_API_KEY=vanta
OPENAI_BASE_URL=http://127.0.0.1:7791/v1
```

Now a local IDE plugin or script written for OpenAI talks to whatever backend Vanta is configured with (Anthropic, Ollama, Gemini, …).

## Vanta as an MCP server

The third direction — exposing a bounded set of Vanta's tools to MCP clients — is covered in [MCP integration](./mcp.md#as-a-server--expose-vanta).
