import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runModalGatewayCommand, type ModalGatewayDeps } from "./modal-gateway-cmd.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-modal-gateway-"));
  roots.push(root);
  return root;
}

function fixture(overrides: Partial<ModalGatewayDeps> = {}): ModalGatewayDeps & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log: (line) => lines.push(line),
    readiness: async () => ({ ok: true }),
    now: () => new Date("2026-07-10T12:00:00.000Z"),
    ...overrides,
  };
}

function control(opts: { secret?: boolean; tasks?: string; proof?: string; deploy?: string } = {}) {
  return vi.fn(async (_command: string, args: string[]) => {
    if (args[0] === "app") return {
      stdout: JSON.stringify([{ description: "vanta-gateway", state: "deployed", tasks: opts.tasks ?? "0" }]),
      stderr: "",
    };
    if (args[0] === "secret") return {
      stdout: JSON.stringify(opts.secret === false ? [] : [{ name: "vanta-gateway" }]),
      stderr: "",
    };
    if (args[0] === "deploy") return { stdout: opts.deploy ?? "Created web function gateway => https://team--vanta-gateway.modal.run", stderr: "" };
    if (args[0] === "volume") return { stdout: opts.proof ?? "", stderr: "" };
    throw new Error(`unexpected modal args: ${args.join(" ")}`);
  });
}

describe("Modal gateway command", () => {
  it("reports the deployment, zero-task state, secret, and hibernate policy", async () => {
    const deps = fixture({ run: control() });
    const root = await workspace();
    expect(await runModalGatewayCommand(root, ["deploy"], {}, deps)).toBe(0);
    deps.lines.length = 0;
    expect(await runModalGatewayCommand(root, ["status"], {
      VANTA_TELEGRAM_TOKEN: "private-token",
      VANTA_TELEGRAM_WEBHOOK_SECRET: "private-hook",
    }, deps)).toBe(0);
    expect(deps.lines.join("\n")).toContain("deployed · 0 task(s)");
    expect(deps.lines.join("\n")).toContain("Telegram registration https://team--vanta-gateway.modal.run · token present · webhook secret present");
    expect(deps.lines.join("\n")).not.toContain("private-token");
    expect(deps.lines.join("\n")).not.toContain("private-hook");
    expect(deps.lines.join("\n")).toContain("min 0 · scaledown 60s");
  });

  it("refuses deploy before invoking Modal when the named secret is absent", async () => {
    const run = control({ secret: false });
    const deps = fixture({ run });
    expect(await runModalGatewayCommand(await workspace(), ["deploy"], {}, deps)).toBe(1);
    expect(run.mock.calls.some(([, args]) => args[0] === "deploy")).toBe(false);
    expect(deps.lines.join("\n")).toContain("will not copy local secrets");
  });

  it("deploys with min-zero helper config and records the endpoint without secrets", async () => {
    const root = await workspace();
    const run = control();
    const deps = fixture({ run, helper: "/vanta/modal-gateway.py" });
    expect(await runModalGatewayCommand(root, ["deploy"], {}, deps)).toBe(0);
    expect(run.mock.calls.some(([, args]) => args.slice(0, 3).join(" ") === "deploy /vanta/modal-gateway.py --name")).toBe(true);
    const receipt = await readFile(join(root, ".vanta", "serverless-gateway.json"), "utf8");
    expect(receipt).toContain("https://team--vanta-gateway.modal.run");
    expect(receipt).not.toContain("token");
  });

  it("registers the authenticated Telegram webhook without logging credentials", async () => {
    const root = await workspace();
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const deps = fixture({ run: control(), fetch });
    const env = { VANTA_TELEGRAM_TOKEN: "private-token", VANTA_TELEGRAM_WEBHOOK_SECRET: "private-hook" };
    expect(await runModalGatewayCommand(root, ["register-telegram", "https://team--vanta-gateway.modal.run"], env, deps)).toBe(0);
    expect(requests[0]?.input).toContain("private-token/setWebhook");
    expect(String(requests[0]?.init?.body)).toContain("private-hook");
    expect(deps.lines.join("\n")).not.toContain("private-token");
    expect(deps.lines.join("\n")).not.toContain("private-hook");
  });

  it("redacts Telegram credentials when webhook registration cannot connect", async () => {
    const deps = fixture({
      run: control(),
      fetch: async () => { throw new Error("request included private-token"); },
    });
    const env = { VANTA_TELEGRAM_TOKEN: "private-token", VANTA_TELEGRAM_WEBHOOK_SECRET: "private-hook" };
    expect(await runModalGatewayCommand(
      await workspace(),
      ["register-telegram", "https://team--vanta-gateway.modal.run"],
      env,
      deps,
    )).toBe(1);
    expect(deps.lines.join("\n")).toBe("gateway register failed: Telegram request unavailable");
  });

  it("proves zero -> accepted Telegram reply -> zero from the Modal volume receipt", async () => {
    const root = await workspace();
    const run = control({ proof: JSON.stringify({
      kind: "channel-round-trip",
      platform: "telegram",
      transport: "bot-api",
      conversationHash: "hash",
      parts: 1,
      acceptedAt: "2026-07-10T12:01:00.000Z",
    }) });
    const deps = fixture({ run });
    expect(await runModalGatewayCommand(root, ["deploy"], {}, deps)).toBe(0);
    expect(await runModalGatewayCommand(root, ["arm"], {}, deps)).toBe(0);
    expect(await runModalGatewayCommand(root, ["prove"], {}, deps)).toBe(0);
    expect(deps.lines.at(-2)).toContain("0 tasks -> Telegram wake/reply");
  });

  it("does not pass proof while the woken container is still active", async () => {
    const root = await workspace();
    const idle = control();
    const deps = fixture({ run: idle });
    expect(await runModalGatewayCommand(root, ["deploy"], {}, deps)).toBe(0);
    expect(await runModalGatewayCommand(root, ["arm"], {}, deps)).toBe(0);
    deps.run = control({ tasks: "1", proof: JSON.stringify({
      kind: "channel-round-trip", platform: "telegram", transport: "bot-api",
      conversationHash: "hash", parts: 1, acceptedAt: "2026-07-10T12:01:00.000Z",
    }) });
    expect(await runModalGatewayCommand(root, ["prove"], {}, deps)).toBe(1);
    expect(deps.lines.at(-1)).toContain("wait for scaledown");
  });
});
