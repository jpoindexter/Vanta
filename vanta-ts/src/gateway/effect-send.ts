import {
  executeEffect,
  payloadSha256,
  stableEffectId,
  type EffectGateContext,
  type EffectIntent,
} from "../effects/execute-effect.js";
import type {
  OutboundDeliveryReceipt,
  OutboundFile,
  OutboundFileDeliveryReceipt,
  OutboundMessage,
  PlatformAdapter,
} from "./platforms/base.js";

export type GatewayEffectKind =
  | "gateway.final"
  | "gateway.progress"
  | "gateway.context"
  | "gateway.mobile-control"
  | "gateway.pairing"
  | "gateway.webhook"
  | "gateway.native-file";

function requireGate(gate: EffectGateContext | undefined): EffectGateContext {
  if (!gate) throw new Error("blocked: gateway effect gate unavailable");
  return gate;
}

function messagePayload(message: OutboundMessage): string {
  return JSON.stringify({
    chatId: message.chatId,
    threadId: message.threadId,
    text: message.text,
    buttons: message.buttons,
    image: message.image,
  });
}

function intent(
  platform: PlatformAdapter,
  kind: GatewayEffectKind,
  target: string,
  payload: string | Uint8Array,
  idempotencyKey: string,
): EffectIntent {
  const seed = {
    host: `gateway:${platform.id}`,
    kind,
    targetClass: "messaging-channel",
    payloadSha256: payloadSha256(payload),
    idempotencyKey,
  };
  return {
    id: stableEffectId(seed),
    actor: "gateway",
    action: `${kind} through ${platform.id} to channel ${target}`,
    ...seed,
  };
}

export async function sendGatewayMessage(opts: {
  platform: PlatformAdapter;
  gate?: EffectGateContext;
  message: OutboundMessage;
  kind: Exclude<GatewayEffectKind, "gateway.native-file">;
  idempotencyKey: string;
}): Promise<void | OutboundDeliveryReceipt> {
  const effect = intent(opts.platform, opts.kind, opts.message.chatId, messagePayload(opts.message), opts.idempotencyKey);
  const result = await executeEffect(effect, requireGate(opts.gate), async () => {
    const receipt = await opts.platform.send(opts.message);
    return {
      value: receipt,
      ...(receipt ? {
        acknowledgementId: `${receipt.platform}:${receipt.transport}:${receipt.parts}`,
        readbackSha256: payloadSha256(JSON.stringify(receipt)),
        verified: receipt.accepted,
      } : {}),
    };
  });
  if (result.outcome !== "confirmed" && result.outcome !== "verified") {
    throw new Error(`gateway effect ${result.outcome}: ${opts.kind}`);
  }
  return result.value;
}

export async function sendGatewayFile(opts: {
  platform: PlatformAdapter;
  gate?: EffectGateContext;
  file: OutboundFile;
  idempotencyKey: string;
}): Promise<void | OutboundFileDeliveryReceipt> {
  if (!opts.platform.sendFile) throw new Error(`channel ${opts.platform.id} does not support native files`);
  const effect = intent(opts.platform, "gateway.native-file", opts.file.chatId, opts.file.data, opts.idempotencyKey);
  const result = await executeEffect(effect, requireGate(opts.gate), async () => {
    const receipt = await opts.platform.sendFile!(opts.file);
    return {
      value: receipt,
      ...(receipt ? {
        acknowledgementId: `${receipt.platform}:${receipt.transport}:${receipt.name}:${receipt.bytes}`,
        readbackSha256: payloadSha256(JSON.stringify(receipt)),
        verified: receipt.accepted,
      } : {}),
    };
  });
  if (result.outcome !== "confirmed" && result.outcome !== "verified") {
    throw new Error(`gateway effect ${result.outcome}: gateway.native-file`);
  }
  return result.value;
}
