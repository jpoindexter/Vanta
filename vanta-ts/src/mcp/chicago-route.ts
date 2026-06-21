// VANTA-CHICAGO-MCP — route Vanta's computer-use actions (screenshot, click,
// type, key, scroll) through an MCP server (the "CHICAGO" computer-use MCP)
// instead of a local desktop driver.
//
// This module is PURE + injectable: the action→MCP-call mapping
// (`buildChicagoCall`) and the MCP-response parse (`parseChicagoResult`) take
// plain data, and `routeComputerAction` takes the MCP call as an injected dep
// (`callMcp`), so the whole routing layer unit-tests with NO real MCP server and
// NO network. Errors-as-values throughout: a `callMcp` failure or garbage result
// yields `{ok:false, error}`, never a thrown exception.
//
// The action→MCP-call envelope mirrors the Anthropic computer-use tool shape (a
// single `computer` tool taking `{action, coordinate?, text?, ...}`), which the
// CHICAGO MCP exposes; the MCP-result content blocks are the standard MCP shape
// (`{type:"image", data}` / `{type:"text", text}`) that `textFromContent` reads.
//
// BOUNDARY (NOT done this round): mounting the live CHICAGO MCP server and
// actually executing the calls. When `chicagoEnabled(env)` is true, the
// computer-use tool (e.g. `tools/vision-action.ts`'s actuation step, or a future
// `tools/computer.ts`) would, instead of calling its local driver (screencapture
// / cliclick), route each action through `routeComputerAction(action, {callMcp})`
// where `callMcp` is a mounted CHICAGO `McpClient.callTool` bound to the
// `computer` tool. The live MCP server + the calls executing are the documented
// boundary (mirrors the clarity/install-plan pattern in dxt.ts).
//
// SECURITY: a computer-use action is HIGH-RISK. Routing it through MCP does NOT
// bypass the kernel — when this is wired, the computer-use tool's
// `describeForSafety` still feeds the kernel `assess()` gate exactly as a LOCAL
// computer-use call would, so MCP is only the WHERE (where the action executes),
// the kernel is the WHETHER (whether it's allowed at all). An action's
// coordinates and text are DATA (the click target / the keystrokes to send) —
// validated as types, never interpreted as a shell command; `type` text is the
// payload, carried verbatim.

/** The CHICAGO MCP tool name every action routes to (Anthropic computer-tool shape). */
export const CHICAGO_TOOL = "computer";

/** The env var naming the CHICAGO MCP server. Set = on; unset/empty = OFF (default). */
export const CHICAGO_ENV = "VANTA_CHICAGO_MCP";

/**
 * Vanta's computer-use action vocabulary — the same primitives the local driver
 * exposes (screenshot, click, type, key, scroll). A closed discriminated union so
 * every kind maps to exactly one MCP call. Coordinates/`dy` are numbers (the
 * click target / scroll delta); `text`/`key` are the data payload to send.
 */
export type ComputerAction =
  | { kind: "screenshot" }
  | { kind: "click"; x: number; y: number }
  | { kind: "type"; text: string }
  | { kind: "key"; key: string }
  | { kind: "scroll"; x: number; y: number; dy: number };

/** The MCP tool-call envelope `buildChicagoCall` produces: the tool + its args. */
export type ChicagoCall = { tool: string; args: Record<string, unknown> };

/** The parsed routed result — image → base64, text → text, garbage → error. */
export type ChicagoResult =
  | { ok: true; screenshotBase64?: string; text?: string }
  | { ok: false; error: string };

/** Injected deps for {@link routeComputerAction} — the MCP call is the boundary. */
export type ChicagoDeps = {
  /** Call the mounted CHICAGO MCP tool. THE only impure input (the live boundary). */
  callMcp: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

/** scroll `dy` → the CHICAGO scroll direction (down = positive, matching screen Y). */
function scrollDirection(dy: number): "up" | "down" {
  return dy < 0 ? "up" : "down";
}

/**
 * Map one {@link ComputerAction} to the CHICAGO MCP call envelope (tool + args).
 * PURE + total: the discriminated union is exhaustive, so every action kind
 * yields a well-formed `{action, ...}` arg object for the single `computer` tool.
 *
 * - screenshot → `{action:"screenshot"}`
 * - click      → `{action:"left_click", coordinate:[x,y]}`
 * - type       → `{action:"type", text}`   (text is DATA — sent verbatim)
 * - key        → `{action:"key", text:key}` (the Anthropic computer tool takes the
 *                key combo in `text`)
 * - scroll     → `{action:"scroll", coordinate:[x,y], scroll_direction, scroll_amount}`
 */
export function buildChicagoCall(action: ComputerAction): ChicagoCall {
  const tool = CHICAGO_TOOL;
  switch (action.kind) {
    case "screenshot":
      return { tool, args: { action: "screenshot" } };
    case "click":
      return { tool, args: { action: "left_click", coordinate: [action.x, action.y] } };
    case "type":
      return { tool, args: { action: "type", text: action.text } };
    case "key":
      return { tool, args: { action: "key", text: action.key } };
    case "scroll":
      return {
        tool,
        args: {
          action: "scroll",
          coordinate: [action.x, action.y],
          scroll_direction: scrollDirection(action.dy),
          scroll_amount: Math.abs(action.dy),
        },
      };
  }
}

/** One MCP content block — the standard `{type, text?, data?, ...}` shape. */
type ContentBlock = { type?: unknown; text?: unknown; data?: unknown; mimeType?: unknown };

/** Is this block an image content block carrying base64 `data`? */
function imageBase64(block: ContentBlock): string | undefined {
  if (block.type === "image" && typeof block.data === "string" && block.data) return block.data;
  return undefined;
}

/** Is this block a text content block carrying a non-empty `text`? */
function blockText(block: ContentBlock): string | undefined {
  if (block.type === "text" && typeof block.text === "string" && block.text) return block.text;
  // Tolerate a `{text}`-only block with no explicit type (some servers omit it).
  if (block.type === undefined && typeof block.text === "string" && block.text) return block.text;
  return undefined;
}

/** The first image's base64 + every usable text, scanned from a content array. */
type ScannedContent = { screenshotBase64?: string; texts: string[] };

/** Scan an MCP content array for the first image block + all usable text. Pure. */
function scanContent(content: unknown[]): ScannedContent {
  let screenshotBase64: string | undefined;
  const texts: string[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as ContentBlock;
    const img = imageBase64(block);
    if (img && !screenshotBase64) screenshotBase64 = img;
    const txt = blockText(block);
    if (txt) texts.push(txt);
  }
  return { ...(screenshotBase64 ? { screenshotBase64 } : {}), texts };
}

/**
 * Tolerantly parse a CHICAGO `tools/call` result into a {@link ChicagoResult}.
 * The result's `content` is the standard MCP content array; an image block →
 * `screenshotBase64`, text blocks → joined `text`. NEVER throws: a non-object, a
 * missing/empty `content`, or a result with no usable block all yield
 * `{ok:false, error}` — the MCP server is UNTRUSTED input, so garbage is rejected,
 * not coerced into a fake success.
 */
export function parseChicagoResult(mcpResult: unknown): ChicagoResult {
  if (!mcpResult || typeof mcpResult !== "object") {
    return { ok: false, error: "CHICAGO MCP result is not an object" };
  }
  const content = (mcpResult as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) {
    return { ok: false, error: "CHICAGO MCP result has no content blocks" };
  }
  const { screenshotBase64, texts } = scanContent(content);
  if (!screenshotBase64 && texts.length === 0) {
    return { ok: false, error: "CHICAGO MCP result had no image or text content" };
  }
  const text = texts.length > 0 ? texts.join("\n") : undefined;
  return { ok: true, ...(screenshotBase64 ? { screenshotBase64 } : {}), ...(text ? { text } : {}) };
}

/**
 * Is computer-use routing through the CHICAGO MCP enabled? Reads
 * `VANTA_CHICAGO_MCP` — set to the server name = ON, unset/blank = OFF (default).
 * Pure. Returning false means the computer-use tool keeps using its local driver.
 */
export function chicagoEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env[CHICAGO_ENV];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Route one computer-use action through the CHICAGO MCP: build the call envelope,
 * invoke the injected `callMcp`, parse the result. NEVER throws — a `callMcp`
 * rejection (server down / call errored) is caught and returned as
 * `{ok:false, error}`. The injected `callMcp` is the documented boundary (the
 * live MCP call); given it, this fn is fully deterministic and unit-tested.
 *
 * Wiring note: the kernel `assess()` gate is UPSTREAM of this fn — the
 * computer-use tool gates the action before ever calling here, so a routed action
 * is gated identically to a local one (MCP = where, kernel = whether).
 */
export async function routeComputerAction(
  action: ComputerAction,
  deps: ChicagoDeps,
): Promise<ChicagoResult> {
  const call = buildChicagoCall(action);
  try {
    const raw = await deps.callMcp(call.tool, call.args);
    return parseChicagoResult(raw);
  } catch (err) {
    return { ok: false, error: `CHICAGO MCP call failed: ${(err as Error).message}` };
  }
}
