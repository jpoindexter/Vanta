---
id: integrations
title: Editor & API integrations
sidebar_position: 3
---

# Editor & API integrations

Beyond [MCP](./mcp.md), Vanta exposes two local servers so other tools can use it — both locally bound and kernel-gated.

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
