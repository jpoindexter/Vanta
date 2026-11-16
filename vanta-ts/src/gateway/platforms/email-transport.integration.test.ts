import { createServer, type Socket } from "node:net";
import { once } from "node:events";
import { expect, it } from "vitest";
import { imapSmtpTransport } from "./email-transport.js";

it("sends through the installed mail library to a loopback-only SMTP fixture", async () => {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "";
    let data = false;
    let message = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data && line !== ".") { message += `${line}\r\n`; continue; }
        if (data) { messages.push(message); data = false; socket.write("250 queued\r\n"); }
        else if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if (line.startsWith("AUTH")) socket.write("235 authenticated\r\n");
        else if (line === "DATA") { data = true; socket.write("354 send data\r\n"); }
        else if (line === "QUIT") socket.end("221 goodbye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing loopback port");
  const host = { host: "127.0.0.1", port: address.port, secure: false, user: "fixture@example.invalid", pass: "synthetic-fixture" };
  try {
    await imapSmtpTransport({ smtp: host, imap: host }).sendMail({
      to: "recipient@example.invalid", subject: "Dependency smoke", body: "Loopback only. No external mail.",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Subject: Dependency smoke");
    expect(messages[0]).toContain("Loopback only. No external mail.");
    expect(messages[0]).toContain("To: recipient@example.invalid");
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
