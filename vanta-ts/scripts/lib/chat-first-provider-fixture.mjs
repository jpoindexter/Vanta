import { createServer } from "node:http";

/** Only the external model is synthetic. Desktop, HTTP routes, stores and kernel are real. */
export async function chatFirstProviderFixture() {
  const requests = [];
  const held = new Set();
  const server = createServer(async (request, response) => {
    if (request.url === "/v1/models") return json(response, { data: [{ id: "desktop-proof", object: "model" }] });
    if (request.url !== "/v1/chat/completions") return response.writeHead(404).end();
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const latest = [...body.messages].reverse().find((item) => item.role === "user");
    const prompt = typeof latest?.content === "string" ? latest.content : JSON.stringify(latest?.content);
    requests.push({ model: body.model, prompt });
    const approval = prompt.includes("Approval proof") && body.messages.at(-1)?.role !== "tool";
    const blocked = prompt.includes("Blocked continuation proof");
    const answer = blocked ? "Blocked: the required source is unavailable. No brief was written." : prompt.includes("Keep this response open") ? "Response streaming. Waiting for your next instruction." : `Local provider reply: ${prompt}`;
    if (!body.stream) return json(response, { choices: [{ message: { role: "assistant", content: answer } }] });
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    if (blocked && body.messages.at(-1)?.role !== "tool") {
      response.write(event({ role: "assistant", tool_calls: [{ index: 0, id: `local-blocked-${requests.length}`, type: "function",
        function: { name: "todo", arguments: JSON.stringify({ action: "write", items: [{ text: "Read the required unavailable source", status: "pending" }] }) } }] }));
      return response.end(event({}, "tool_calls") + "data: [DONE]\n\n");
    }
    if (approval) {
      response.write(event({ role: "assistant", tool_calls: [{ index: 0, id: `local-approval-${requests.length}`, type: "function",
        function: { name: "edit_file", arguments: JSON.stringify({ path: "brief.md", old_string: "# Local desktop proof", new_string: "# Approved local edit" }) } }] }));
      return response.end(event({}, "tool_calls") + "data: [DONE]\n\n");
    }
    const instruction = prompt.startsWith("Instruction boundary proof:");
    const ordinary = prompt.startsWith("Instruction ordinary source proof:");
    if ((instruction || ordinary) && body.messages.at(-1)?.role !== "tool") {
      const args = instruction
        ? { path: "VANTA.md", content: "# Disposable instruction proof\nNo operator data.\n" }
        : { path: "ordinary-source.ts", content: "export const proof = true;\n" };
      response.write(event({ role: "assistant", tool_calls: [{ index: 0, id: `local-instruction-${requests.length}`, type: "function",
        function: { name: "write_file", arguments: JSON.stringify(args) } }] }));
      return response.end(event({}, "tool_calls") + "data: [DONE]\n\n");
    }
    response.write(event({ role: "assistant", content: answer }));
    if (prompt.includes("Keep this response open")) {
      held.add(response);
      response.on("close", () => held.delete(response));
    } else finish(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`, requests,
    release: () => { for (const response of held) finish(response); held.clear(); },
    close: async () => {
      for (const response of held) response.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function event(delta, finishReason = null) {
  return `data: ${JSON.stringify({ id: "local-proof", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
}
function finish(response) { response.end(event({}, "stop") + "data: [DONE]\n\n"); }
function json(response, value) { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value)); }
