---
id: how-it-works
title: How it works
sidebar_position: 1
---

# How it works

Vanta is two cooperating processes — a small **Rust kernel** that decides what's safe, and a **TypeScript agent** that orchestrates the model and tools. The agent cannot act without the kernel's verdict.

## System overview

```mermaid
flowchart TB
  user([You]) -->|instruction| agent
  subgraph TS["vanta · TypeScript agent layer"]
    agent[Agent loop]
    prompt[3-tier prompt]
    tools[84+ tools]
    brain[(Brain / memory · ~/.vanta)]
    agent --- prompt
    agent --- tools
    agent --- brain
  end
  subgraph RS["vanta-kernel · Rust boundary"]
    assess{{assess}}
    approvals[(Approvals)]
    goals[(Goal ledger)]
    events[(Event log)]
  end
  llm[LLM provider]
  agent <-->|complete + tool schemas| llm
  tools -->|describeForSafety| assess
  assess -->|allow / ask / block| agent
  assess --- approvals
  agent --- goals
  agent --- events
```

The kernel exposes a local HTTP sidecar on `127.0.0.1:7788`; the agent calls `assess` before **every** tool execution.

## One turn, step by step

```mermaid
sequenceDiagram
  participant U as You
  participant A as Agent loop
  participant L as LLM provider
  participant K as Kernel (assess)
  participant T as Tool
  U->>A: instruction
  A->>L: messages + tool schemas
  L-->>A: tool call (or final text)
  A->>K: describeForSafety(args)
  alt block
    K-->>A: BLOCK — refused, no run
  else ask
    K-->>A: ASK
    A->>U: approval prompt
    U-->>A: allow / deny
  else allow
    K-->>A: ALLOW
  end
  A->>T: execute (only if allowed)
  T-->>A: result {ok, output}
  A->>L: append result, continue
  L-->>A: final text
  A-->>U: verified answer
```

## The safety decision

The classifier runs in a fixed order; earlier floors are never downgraded.

```mermaid
flowchart TD
  start([action]) --> block{destructive /<br/>exfiltration?}
  block -->|yes| B[BLOCK]
  block -->|no| scope{outside<br/>root scope?}
  scope -->|yes| ASK1[ASK]
  scope -->|no| cred{system /<br/>credentials?}
  cred -->|yes| ASK2[ASK]
  cred -->|no| rev{irreversible?<br/>push/migrate/deploy}
  rev -->|yes| ASK3[ASK]
  rev -->|no| A[ALLOW]
```

See [Safety model](./safety-model.md) for the tier semantics.

## The three-tier prompt

```mermaid
flowchart LR
  subgraph Prompt
    direction TB
    s["Stable<br/>identity · tools · rules"]
    b["Brain / skills<br/>recalled memory · skill index"]
    v["Volatile<br/>goals · time · recent memory"]
  end
  s --> b --> v --> model[LLM]
```

The stable tier stays cacheable; only the volatile tier changes turn to turn. See [The agent loop](./agent-loop.md).

## Memory & learning

```mermaid
flowchart LR
  turn[Turn transcript] -->|distill| learn[Auto-learn]
  learn --> entries[(Structured entries)]
  learn --> regions[(Markdown regions)]
  entries --> digest[brainDigest]
  regions --> digest
  digest -->|injected| prompt[Prompt · brain tier]
  recall[recall] --> entries
  recall -.reinforces.-> entries
```

Everything persists to `~/.vanta`, git-versioned for free history. See [Skills & memory](./skills-and-memory.md).
