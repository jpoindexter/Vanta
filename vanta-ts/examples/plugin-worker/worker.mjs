import readline from "node:readline";

const pending = new Map();
let sequence = 0;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function request(capability, method, params) {
  const id = String(++sequence);
  send({ type: "host.request", id, capability, method, params });
  return new Promise((resolve) => pending.set(id, resolve));
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.type === "host.response") {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
    return;
  }
  if (message.type === "init") {
    const denied = await request("storage.write", "set", { key: "started", value: true });
    await request("log.write", "write", { message: denied.ok ? "scoped storage ready" : `expected denial: ${denied.error}` });
    await request("ui.panel", "register", {
      panel: { id: "status", title: "Operator worker", lines: [`process ${process.pid}`, "heartbeat scheduled"] },
    });
    await request("schedule.jobs", "register", { name: "heartbeat", intervalMs: 1_000 });
    send({ type: "ready" });
    return;
  }
  if (message.type === "job" && message.name === "heartbeat") {
    await request("log.write", "write", { message: "heartbeat job ran" });
  }
});
lines.on("close", () => process.exit(0));
