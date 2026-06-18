---
name: vanta-port-adapter
description: Use when adding a new swappable Vanta capability, provider, backend, transport, model route, registry, scorer, evaluator, or tool family. Prescribe the port+adapter pattern: define an interface, implement concrete adapters behind one resolver, keep consumers typed to the port, and add tests/boundaries so new code does not deepen concrete coupling.
---

# Vanta Port + Adapter

When adding a capability that may have more than one implementation, build the seam first.

## Pattern

1. Define the **port** as a small TypeScript interface in a neutral module near the capability.
   - Export types from the port module.
   - Keep the interface stable and task-shaped.
   - Do not import concrete adapters from consumers.
2. Put each concrete implementation in an **adapter** module.
   - External SDKs, CLI calls, HTTP clients, file formats, and model-specific quirks stay here.
   - Missing dependency, unavailable service, or disabled env should degrade to a typed error/no-op adapter, not throw through the core.
3. Add one **resolver/registry** module.
   - Read env/config once.
   - Choose the adapter.
   - Return the port type.
   - Keep registration to one line per adapter.
4. Consumers depend on the port.
   - Use `import type` for the interface.
   - Accept the port through deps when practical.
   - Tests should pass with a fake/null adapter.
5. Add a boundary or shrink-only note when the seam protects an important dependency direction.

## In-Repo Reference Patterns

- `providers/interface.ts` + `providers/index.ts` - `LLMProvider` port and `resolveProvider`.
- `mcp/client.ts` - transport interface isolates concrete MCP transports.
- `agent/agent-types.ts` - `AgentDeps` keeps the loop injectable.
- `loop/types.ts` - `IterationDeps` lets workflow stages swap runner behavior.
- `code-intel/provider.ts` + `code-intel/index.ts` - port, null provider, resolver, adapter.

## Avoid

- Importing SDK clients directly from tools, commands, or the agent loop.
- Scattering env checks across consumers.
- Adding a concrete class where an interface is enough.
- Creating a second registration path for the same capability.
- Letting a default adapter be required for tests.

## Verification

- Add pure tests for resolver selection, disabled/missing dependency behavior, and fake-adapter consumer behavior.
- Run `npx tsc --noEmit`.
- Run the narrow test file and the size gate for touched files.
- If the seam is architectural, add or update an `arch/boundaries.ts` rule.

## Grandfathered Gaps

Do not copy these patterns into new work:

- `factory/run.ts` still has concrete stage imports until `PORT-FACTORY-DEPS`.
- `tools/registry.ts` is still a concrete class until `PORT-TOOL-REGISTRY-IFACE`.
- Rust kernel files and `vanta-ts/src/factory/*` stay protected; do not edit them without human approval.
