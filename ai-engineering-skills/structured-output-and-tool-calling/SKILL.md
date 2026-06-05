---
name: structured-output-and-tool-calling
description: Reference-grade guide to getting reliable structured output and tool/function calls out of LLMs — JSON mode vs constrained/grammar-guided decoding, response_format json_schema and tool-schema coercion, Zod/Pydantic validation at the boundary, the validate→repair→escalate→fallback loop, tool-argument validation, idempotency for safe retries, fallback chains, and evals. Use when an LLM must return parseable JSON, fill typed tool arguments, or drive deterministic downstream code.
tags: [ai-engineering, structured-output, function-calling, json-schema]
---

# Structured Output & Tool Calling Reliability

The moment an LLM's output feeds deterministic code — a parser, a database write, a payment call — "usually valid" is a production incident waiting on a percentage. This skill is about closing that gap: making the *structure* guaranteed, the *contents* validated, the *execution* idempotent, and the *failures* recoverable.

Core mental model — three independent guarantees, do not conflate them:

1. **Structural validity** (is it parseable JSON matching the schema shape?) — solved by *constrained decoding*.
2. **Semantic validity** (are the values correct, in-range, referencing real things?) — solved only by *validation + repair*.
3. **Execution safety** (does running it twice double-charge?) — solved only by *idempotency*.

Constrained decoding gives you #1 for free and *nothing else*. You still own #2 and #3.

---

## 1. Structured output: JSON mode vs constrained decoding

The single most important distinction in this whole skill:

| Mechanism | What it does | Guarantee | Still need to validate? |
|---|---|---|---|
| **JSON mode** (`response_format: {type:"json_object"}`) | Biases the model toward JSON via prompt + light logit nudging | Best-effort. Can still truncate, emit wrong types, omit fields | **Yes — always** |
| **Constrained / grammar-guided decoding** (`json_schema` strict, GBNF, Outlines) | At every sampling step, *masks out* tokens that would violate the grammar/schema | Structurally valid by construction — cannot emit a token that breaks the schema | Yes, for *semantics* — but never for parse/shape |
| **Free-text + parse** (no mode) | Nothing; you `JSON.parse` whatever comes out | None. Prose wrappers, markdown fences, commentary | Yes, and brace for failure |

**Why constrained decoding eliminates malformed JSON:** the decoder maintains a grammar state machine. Before sampling each token, it computes the set of tokens that keep the partial output grammar-valid and sets every other token's logit to `-inf`. The model literally cannot sample a `}` where the schema requires more fields, or a string where it requires an integer. There is no "the model usually closes its braces" — closing is the only legal move. This is the difference between *guaranteed-valid* and *best-effort*. If you have access to constrained decoding for a schema-shaped task, use it; it deletes an entire class of bugs.

### Provider mapping (capability-level — verify exact model support before relying on it)

- **OpenAI Structured Outputs** — `response_format: {type:"json_schema", json_schema:{name, strict:true, schema:{...}}}`. With `strict:true` this is *constrained decoding*: output is guaranteed to match the JSON Schema (subset: every field `required`, `additionalProperties:false`, limited type expressivity). The older `{type:"json_object"}` is JSON *mode* — best-effort, validate it.
- **OpenAI tool calls** — pass `tools` with JSON-Schema `parameters`; `strict:true` on a function applies the same constrained guarantee to its arguments.
- **Anthropic (Claude)** — no native `json_schema` response_format. The stable pattern is **tool-schema coercion**: define a single tool whose `input_schema` is your target schema, then force it with `tool_choice:{type:"tool", name:"..."}`. The model fills the tool's arguments = your structured object. Read it from the `tool_use` block. Validation still required; coercion biases shape but is not token-masked grammar enforcement.
- **Open / local** — `Outlines` (regex + JSON-Schema → FSM-masked logits), `llama.cpp` **GBNF** grammars, `vLLM`/`SGLang`/`TGI` guided-decoding backends (`guided_json`, `guided_grammar`). These are *true* constrained decoding and work with any JSON Schema or hand-written grammar.

```text
GBNF sketch — a grammar IS the contract:
root   ::= "{" ws "\"action\"" ws ":" ws action ws "," ws "\"id\"" ws ":" ws integer ws "}"
action ::= "\"create\"" | "\"update\"" | "\"delete\""   # enum, structurally enforced
integer::= "-"? [0-9]+
```

### Validate at the boundary — always, even with constrained decoding

Constrained decoding guarantees *shape*, not *meaning*. A schema-valid object can still say `quantity: -5` or `country: "Wakanda"`. Put a real validator at the trust boundary and parse into a typed object so the rest of your code touches only validated data.

```ts
// Zod — single source of truth: feed .toJSON()→JSON Schema to the model, parse the reply
const Order = z.object({
  action: z.enum(["create", "update", "delete"]),
  quantity: z.number().int().positive(),        // catches -5 that the schema "shape" allows
  sku: z.string().regex(/^[A-Z]{3}-\d{4}$/),
});
const parsed = Order.safeParse(JSON.parse(raw));
if (!parsed.success) return repairLoop(raw, parsed.error);   // see §3
```

```python
# Pydantic — model_validate_json does parse + validate + coerce in one step
class Order(BaseModel):
    action: Literal["create", "update", "delete"]
    quantity: PositiveInt
    sku: constr(pattern=r"^[A-Z]{3}-\d{4}$")
try:
    order = Order.model_validate_json(raw)
except ValidationError as e:
    return repair_loop(raw, e)
```

**Do:** derive the model-facing JSON Schema *from* your Zod/Pydantic type (one source of truth). **Don't:** hand-write a JSON Schema for the API and a separate validator — they drift, and the gap is exactly where bad data flows.

---

## 2. Failure modes of structured output

Even good setups fail. Know the catalogue so you can detect and repair each one specifically.

| Failure mode | Cause | Detection | Fix |
|---|---|---|---|
| **Malformed JSON** | No constrained decoding; weak model | `JSON.parse` throws | Constrained decoding; else repair loop |
| **Truncation** | `max_tokens` hit mid-object; stream cut | Parse error at EOF; `finish_reason:"length"` | Raise `max_tokens`; partial-parse; continue/repair |
| **Wrong types** | `"5"` vs `5`, `"true"` vs `true` | Validator type error | Zod/Pydantic coercion; strict schema |
| **Extra prose** | "Here is the JSON: ```json …```" | Leading/trailing non-JSON | JSON mode; strip fences; extract first `{…}` |
| **Hallucinated fields** | Model invents keys | `additionalProperties:false` / Zod `.strict()` | Reject + repair |
| **Missing required fields** | Model omits | Validator "required" error | `strict:true`; repair with the missing field named |
| **Enum violation** | Value outside allowed set | Validator enum error | Constrained decoding enforces enums; else repair |
| **Nested-depth / array errors** | Deep or recursive schemas confuse model | Validator path error | Flatten schema; fewer levels; provide an example |
| **Empty / null where required** | Model unsure, emits `null` | Validator non-nullable error | Make optionality explicit; ask for a sentinel |

### The repair loop

Treat the validator's error as a *signal to the model*, not just a 500 to the user. Bounded, escalating, idempotent.

```text
validate(output)
  ├─ ok ────────────────────────────────► return typed object
  └─ fail
       ├─ attempts < N (e.g. 2):
       │     feed back: original output + the EXACT validator error
       │     ("field `quantity` must be a positive integer, got -5; return corrected JSON only")
       │     re-call SAME model → validate again (loop)
       ├─ attempts exhausted:
       │     ESCALATE → stronger model, same prompt + error
       └─ still failing:
             FALLBACK → deterministic default / queue for human / typed error to caller
```

Rules that make repair work:

- **Bound it.** 1–2 repair attempts, then escalate. Unbounded retry loops burn tokens and latency on a model that's stuck.
- **Feed the real error back verbatim.** "Invalid input" teaches the model nothing. "`sku` must match `^[A-Z]{3}-\d{4}$`, got `abc`" gets a fix in one shot.
- **Idempotent repair.** A repair retry must not have side effects — never execute the action mid-repair; only re-derive the object. Execution happens once, *after* a clean validate.
- **Partial-parse / streaming JSON.** When streaming, use a tolerant incremental parser (`partial-json`, `best-effort-json-parser`, `jsonrepair`) to render in-progress UI, but **only validate and act on the final completed object.** Never trigger a tool from a partial parse.
- **Truncation is special.** If `finish_reason === "length"`, the object isn't wrong — it's *incomplete*. Don't "repair" it as malformed; re-request with higher `max_tokens` or use a continuation strategy.

---

## 3. Function / tool calling reliability

A tool call is structured output whose schema is a function signature — every structured-output rule applies, plus the brutal new fact: **the output triggers real-world side effects.** A hallucinated number in a summary is cosmetic; a hallucinated argument to `refund(amount)` is money.

### Tool contracts — design for the model, not just the compiler

```ts
{
  name: "search_orders",                       // verb_noun, unambiguous, no overlap with siblings
  description: "Search orders by customer email. Returns up to `limit` orders, newest first. " +
               "Use ONLY for lookups — does not modify anything.",   // says what it does AND when to use it
  parameters: {
    type: "object",
    properties: {
      email:  { type: "string", format: "email", description: "Exact customer email" },
      status: { type: "string", enum: ["open","shipped","cancelled"] },  // constrain, don't free-text
      limit:  { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
    required: ["email"],                        // required vs optional, explicit
    additionalProperties: false,
  },
}
```

| Do | Don't |
|---|---|
| One clear responsibility per tool, verb-first name | `handle_data`, `do_action`, vague catch-alls |
| Description states *what* and *when to use / not use* | Description restates the name |
| `enum` every closed set; `min/max`/`format` every value | Free-text params the model can hallucinate |
| Mark `required` vs optional; give sane `default`s | Everything optional → model omits the field you need |
| Include 1 example call in the system prompt for tricky tools | Assume the model infers usage from the name |
| Cap the toolset (see degradation below) | 40 tools in one call and hope |

### Validate arguments BEFORE executing — never trust LLM args

The model's tool call is a *request*, not an authorization. Re-validate against the schema **and** business rules in your code before the side effect runs.

```ts
function dispatch(call: ToolCall) {
  const tool = registry[call.name];
  if (!tool) return toolError(call, `Unknown tool '${call.name}'. Available: ${Object.keys(registry)}`);  // hallucinated tool
  const args = tool.schema.safeParse(call.arguments);
  if (!args.success) return toolError(call, args.error.message);   // hallucinated/invalid args → back to model
  if (!authorize(tool, args.data)) return toolError(call, "Not permitted");  // business rule, not the LLM's call
  return tool.run(args.data);   // only now does anything happen
}
```

**The hallucinated tool call** comes in two flavors, both caught above by *not trusting the call*:
- **Tool that doesn't exist** — model invents `delete_everything`. Catch: registry lookup fails → return a tool-result error listing real tools; the model self-corrects next turn.
- **Wrong / invented arguments** — right tool, garbage args (made-up order ID, out-of-enum status). Catch: schema validation fails → return the error as the tool result; do **not** execute.

Returning the error *as a tool result* (not throwing) keeps the model in the loop and lets it retry with corrected input — far better than crashing the run.

### Tool-choice forcing & parallel calls

- **`tool_choice`** — `auto` (model decides), `required`/`any` (must call *some* tool), or force a *specific* tool (= structured-output coercion, §1). Force when you know a tool is needed; leave `auto` for genuine routing.
- **Parallel tool calls** — providers may return several `tool_use` blocks in one turn. Execute them, but: validate each independently, watch for the same write issued twice (dedupe via idempotency, §4), and return *all* results before the next model turn or you desync the conversation.

### Too-many-tools degradation — cap and route

Accuracy of tool selection drops as the toolset grows (more near-synonym descriptions to disambiguate, more schema in context). Past ~15–20 tools, expect wrong-tool picks and ignored tools.

**Mitigations, cheapest first:** (1) **cap** the tools exposed per call to the handful relevant to the task; (2) **route** — a cheap first-stage model/retriever picks the relevant 5–10 tools, then the main call sees only those; (3) **namespace/group** tools and expose one group at a time; (4) **merge** near-duplicate tools behind one with an `action` enum. Don't paste your entire API surface into every request.

---

## 4. Idempotency — so retries don't double-charge

Repair loops, parallel calls, network retries, and at-least-once queues all mean a write tool **will** be invoked more than once for one logical intent. If executing it twice does damage, you have a latent incident. Design every write tool so duplicate execution is a no-op.

| Tool kind | Retry safety | Rule |
|---|---|---|
| **Read** (`search`, `get`, `list`) | Inherently safe | Retry freely; no key needed |
| **Idempotent write** (`set_status`, `upsert`) | Safe by design | Same input → same end state |
| **Non-idempotent write** (`charge`, `send_email`, `append`) | **Dangerous** | Require an idempotency key; dedupe |
| **Destructive** (`delete`, `drop`, `payout`) | Dangerous + irreversible | Idempotency key **+** explicit human confirmation |

Patterns:

- **Idempotency keys.** Derive a stable key from the logical intent (`hash(tool + canonical_args)` or a request-scoped UUID minted once before any retry). Pass it to the downstream system (Stripe-style `Idempotency-Key`) or store `seen_keys`; on a duplicate key, return the cached prior result instead of re-executing.
- **Dedupe at the boundary.** Before executing a write, check whether this exact `(key)` already ran this session. The repair loop must reuse the *same* key across attempts — minting a new key per retry defeats the whole mechanism.
- **Read vs write safety.** Auto-execute read tools; gate write tools through validation + idempotency; gate destructive tools through an explicit confirmation step (surface the action to a human/approval queue before running).
- **Make the model's retry cheap and safe.** Because tool-arg errors are fed back for repair, the *same* call can arrive twice with one tweak — idempotency keys keyed on intent (not on the exact bytes) absorb that.

---

## 5. Fallback chains

Compose the mechanisms into a single degrade-gracefully path. Each stage is strictly more expensive/slower than the last; stop at the first success.

```text
1. Constrained decoding (json_schema strict / GBNF)   ← structurally valid, cheapest
2. Validate (Zod/Pydantic)                            ← semantic check
3. Repair loop ×N (feed error back, same model)       ← fixes most semantic misses
4. Escalate to a stronger model (same prompt+error)   ← for genuinely hard cases
5. Deterministic default / human review / typed error ← never crash the caller
```

The non-negotiable bottom rung: **a typed, actionable failure, never an unhandled throw or a silent empty object.** Downstream code should receive `Result<T, StructuredOutputError>`, not a surprise.

---

## 6. Evals for structured output

You cannot improve reliability you don't measure. Run these continuously on a fixed input set across model/prompt/schema changes.

| Metric | Definition | Target |
|---|---|---|
| **Valid-rate** | % outputs that parse + pass schema on first try | The headline number; track per model |
| **Repair-rate** | % needing ≥1 repair attempt | High → fix schema/prompt, not just retry |
| **Repair-success** | % of repairs that converge within N | Low → escalate sooner |
| **Field accuracy** | per-field correctness vs gold labels | Catches enum/type drift a valid-rate hides |
| **Tool-selection accuracy** | right tool chosen for the intent | Drops as toolset grows → triggers routing |
| **Arg accuracy** | tool args correct vs expected | Separate from selecting the right tool |
| **Hallucinated-call rate** | calls to nonexistent tools / invalid args | Should trend to ~0 with good contracts |

**Do:** keep a golden set of inputs with expected structured outputs; assert per-field, not just "did it parse." A 100% valid-rate with 60% field accuracy is a worse failure than a parse error — it *looks* fine and ships wrong data. **Don't:** measure only valid-rate; constrained decoding can make it 100% while the *contents* are nonsense.

---

## Quick reference — decision order

1. Can I use **constrained decoding** for this schema? → Do it. Malformed JSON gone.
2. **Validate** the result at the boundary with Zod/Pydantic into a typed object — always, even after #1.
3. On failure: **repair** (≤2×, feed the exact error) → **escalate** model → **fallback** to a typed default/human.
4. For tools: tight **contracts**, **validate args before executing**, catch **hallucinated** calls by not trusting them, **cap/route** when tools are many.
5. Make every write **idempotent**; gate destructive actions on confirmation.
6. **Eval** valid-rate *and* field accuracy continuously — the second is the one that lies quietly.
