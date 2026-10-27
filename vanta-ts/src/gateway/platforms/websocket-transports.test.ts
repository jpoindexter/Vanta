import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { httpTransport as nostrTransport } from "./nostr.js";
import { httpTransport as twitchTransport } from "./twitch.js";

// A bounded RFC 6455 peer: only tiny fixture frames, never a public connection.
function serverFrame(opcode: number, payload: string | Buffer): Buffer {
  const body = Buffer.from(payload);
  const header = body.length < 126
    ? Buffer.from([0x80 | opcode, body.length])
    : Buffer.from([0x80 | opcode, 126, body.length >> 8, body.length & 255]);
  return Buffer.concat([header, body]);
}

function readClientFrame(buffer: Buffer) {
  if (buffer.length < 6) return undefined;
  const shortLength = buffer[1]! & 127;
  if (shortLength === 127) throw new Error("Fixture rejects large frames");
  const offset = shortLength === 126 ? 4 : 2;
  if (buffer.length < offset + 4) return undefined;
  const length = shortLength === 126 ? buffer.readUInt16BE(2) : shortLength;
  if (length > 4096) throw new Error("Fixture frame limit exceeded");
  const end = offset + 4 + length;
  if (buffer.length < end) return undefined;
  const mask = buffer.subarray(offset, offset + 4);
  const payload = Buffer.from(buffer.subarray(offset + 4, end));
  for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;
  return { opcode: buffer[0]! & 15, payload, rest: buffer.subarray(end) };
}

function receiveFrames(socket: Duplex, state: { texts: string[]; pongs: string[]; closes: number }) {
  let pending: Buffer = Buffer.alloc(0);
  socket.on("data", (data: Buffer) => {
    pending = Buffer.concat([pending, data]);
    let frame = readClientFrame(pending);
    while (frame) {
      pending = frame.rest;
      if (frame.opcode === 1) state.texts.push(frame.payload.toString());
      if (frame.opcode === 10) state.pongs.push(frame.payload.toString());
      if (frame.opcode === 8) {
        state.closes++;
        socket.end(serverFrame(8, frame.payload));
      }
      frame = readClientFrame(pending);
    }
  });
}

async function loopbackPeer() {
  const server = createServer();
  const sockets = new Set<Duplex>();
  const state = { texts: [] as string[], pongs: [] as string[], closes: 0 };
  server.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"]!;
    const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    receiveFrames(socket, state);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture port");
  return {
    port: address.port, state,
    send(opcode: number, payload: string) {
      for (const socket of sockets) socket.write(serverFrame(opcode, payload));
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const originalDispatcher = getGlobalDispatcher();
let peer: Awaited<ReturnType<typeof loopbackPeer>> | undefined;
let dispatcher: Agent | undefined;

afterEach(async () => {
  setGlobalDispatcher(originalDispatcher);
  vi.unstubAllGlobals();
  await peer?.close();
  await dispatcher?.close();
  peer = undefined;
  dispatcher = undefined;
});

function rejectNativeWebSocket() {
  const native = vi.fn(function () { throw new Error("Unsafe native WebSocket selected"); });
  vi.stubGlobal("WebSocket", native);
  return native;
}

describe("maintained Nostr WebSocket", () => {
  it("subscribes, buffers once, signs/publishes, handles one PING and disconnects without native WebSocket", async () => {
    peer = await loopbackPeer();
    const native = rejectNativeWebSocket();
    const transport = nostrTransport("1".padStart(64, "0"), [`ws://127.0.0.1:${peer.port}`]);
    try {
      await transport.connect();
      await vi.waitFor(() => expect(peer!.state.texts).toHaveLength(1));
      const subscription = JSON.parse(peer.state.texts[0]!);
      expect(subscription).toEqual(["REQ", expect.any(String), { kinds: [1, 4], "#p": [transport.pubkey] }]);
      const inbound = JSON.stringify(["EVENT", subscription[1], { content: "local inbound" }]);
      peer.send(1, inbound);
      const buffered: unknown[] = [];
      await vi.waitFor(async () => { buffered.push(...await transport.poll() as unknown[]); expect(buffered).toEqual([inbound]); });
      expect(await transport.poll()).toEqual([]);
      await transport.publish("2".repeat(64), "local reply");
      await vi.waitFor(() => expect(peer!.state.texts).toHaveLength(2));
      expect(JSON.parse(peer.state.texts[1]!)).toEqual(["EVENT", expect.objectContaining({ content: "local reply", pubkey: transport.pubkey, sig: expect.stringMatching(/^[a-f0-9]{128}$/) })]);
      peer.send(9, "one-safe-ping");
      await vi.waitFor(() => expect(peer!.state.pongs).toEqual(["one-safe-ping"]));
      await transport.disconnect();
      await vi.waitFor(() => expect(peer!.state.closes).toBe(1));
      expect(native).not.toHaveBeenCalled();
    } finally { await transport.disconnect(); }
  });

});

describe("maintained Twitch WebSocket", () => {
  it("keeps its fixed URL, handshakes, buffers, PONGs, sends and disconnects without native WebSocket", async () => {
    peer = await loopbackPeer();
    const native = rejectNativeWebSocket();
    const destinations: string[] = [];
    dispatcher = new Agent({ connect(options, callback) {
      destinations.push(`${options.protocol}//${options.hostname}:${options.port || "443"}`);
      if (destinations.at(-1) !== "https://irc-ws.chat.twitch.tv:443") return callback(new Error("Unexpected destination"), null);
      const socket = connect({ host: "127.0.0.1", port: peer!.port });
      socket.once("connect", () => callback(null, socket));
      socket.once("error", (error) => callback(error, null));
    } });
    setGlobalDispatcher(dispatcher);
    const transport = twitchTransport("fixture-only-not-a-token", "localbot", "localchannel");
    try {
      await transport.connect();
      await vi.waitFor(() => expect(peer!.state.texts).toHaveLength(3));
      expect(destinations).toEqual(["https://irc-ws.chat.twitch.tv:443"]);
      expect(peer.state.texts).toEqual(["PASS oauth:fixture-only-not-a-token\r\n", "NICK localbot\r\n", "JOIN #localchannel\r\n"]);
      peer.send(1, "PING :fixture\r\n:guest!g@local PRIVMSG #localchannel :local inbound\r\n");
      await vi.waitFor(() => expect(peer!.state.texts.at(-1)).toBe("PONG :fixture\r\n"));
      expect(transport.recv()).toContain("local inbound");
      expect(transport.recv()).toBe("");
      transport.send("PRIVMSG #localchannel :local reply");
      await vi.waitFor(() => expect(peer!.state.texts.at(-1)).toBe("PRIVMSG #localchannel :local reply\r\n"));
      peer.send(9, "one-safe-ping");
      await vi.waitFor(() => expect(peer!.state.pongs).toEqual(["one-safe-ping"]));
      transport.close();
      await vi.waitFor(() => expect(peer!.state.closes).toBe(1));
      expect(native).not.toHaveBeenCalled();
    } finally { transport.close(); }
  });
});
