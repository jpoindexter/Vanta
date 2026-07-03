import { describe, it, expect } from "vitest";
import { WeChatAdapter, type WeChatTransport } from "./wechat.js";
import {
  parseWeChatMessage,
  parseWeChatEvents,
  buildWeChatMessage,
  parseWeChatAllowlist,
  wechatEnabled,
  xmlTag,
} from "./wechat-parse.js";

const textXml = (content = "this is a test", from = "oOPEN_ID") =>
  `<xml><ToUserName><![CDATA[gh_bot]]></ToUserName><FromUserName><![CDATA[${from}]]></FromUserName>` +
  `<CreateTime>1348831860</CreateTime><MsgType><![CDATA[text]]></MsgType>` +
  `<Content><![CDATA[${content}]]></Content><MsgId>1234567890123456</MsgId></xml>`;

describe("xmlTag", () => {
  it("unwraps CDATA and bare element text", () => {
    expect(xmlTag("<MsgId>42</MsgId>", "MsgId")).toBe("42");
    expect(xmlTag("<Content><![CDATA[hi there]]></Content>", "Content")).toBe("hi there");
    expect(xmlTag("<xml></xml>", "Missing")).toBeUndefined();
  });
});

describe("parseWeChatMessage", () => {
  it("maps a text message to an InboundMessage routed by the sender openid", () => {
    expect(parseWeChatMessage(textXml())).toEqual({
      chatId: "oOPEN_ID",
      from: "oOPEN_ID",
      text: "this is a test",
      id: "1234567890123456",
      isGroup: false,
    });
  });

  it("returns null for a non-text message, missing content, or non-xml", () => {
    const imageXml = textXml().replace("text", "image");
    expect(parseWeChatMessage(imageXml)).toBeNull();
    expect(parseWeChatMessage("<xml><MsgType><![CDATA[text]]></MsgType></xml>")).toBeNull(); // no from/content
    expect(parseWeChatMessage("not xml at all")).toBeNull();
  });
});

describe("parseWeChatEvents + build + enable", () => {
  it("parses an array of XML strings, dropping non-strings", () => {
    expect(parseWeChatEvents([textXml("one"), 42, textXml("two")]).map((m) => m.text)).toEqual(["one", "two"]);
    expect(parseWeChatEvents(textXml("solo")).map((m) => m.text)).toEqual(["solo"]);
  });
  it("builds a custom-service text body", () => {
    expect(buildWeChatMessage("oX", "hi")).toEqual({ touser: "oX", msgtype: "text", text: { content: "hi" } });
  });
  it("is enabled only when both app credentials are present", () => {
    expect(wechatEnabled({ VANTA_WECHAT_APP_ID: "a", VANTA_WECHAT_APP_SECRET: "b" } as NodeJS.ProcessEnv)).toBe(true);
    expect(wechatEnabled({ VANTA_WECHAT_APP_SECRET: "b" } as NodeJS.ProcessEnv)).toBe(false);
  });
  it("parses a comma allowlist", () => {
    expect([...parseWeChatAllowlist({ VANTA_WECHAT_ALLOWLIST: "oA, oB" } as NodeJS.ProcessEnv)]).toEqual(["oA", "oB"]);
  });
});

describe("WeChatAdapter", () => {
  function fake(inbound: unknown, sent: unknown[]): WeChatTransport {
    return { poll: async () => inbound, send: async (body) => { sent.push(body); } };
  }

  it("polls webhook XML into messages and sends a custom body keyed by openid", async () => {
    const sent: unknown[] = [];
    const a = new WeChatAdapter({ transport: fake([textXml("hey")], sent) });
    const msgs = await a.poll();
    expect(msgs[0]).toMatchObject({ chatId: "oOPEN_ID", text: "hey" });

    await a.send({ chatId: "oOPEN_ID", text: "reply" });
    expect(sent).toEqual([{ touser: "oOPEN_ID", msgtype: "text", text: { content: "reply" } }]);
  });

  it("filters to the allowlist and never throws on a failing send", async () => {
    const a = new WeChatAdapter({
      transport: { poll: async () => [textXml()], send: async () => { throw new Error("boom"); } },
      allow: new Set(["oOTHER"]),
    });
    expect(await a.poll()).toEqual([]); // sender not allowlisted
    await expect(a.send({ chatId: "oX", text: "hi" })).resolves.toBeUndefined();
  });
});
