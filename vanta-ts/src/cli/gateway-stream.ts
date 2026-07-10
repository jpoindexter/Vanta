import type { RunTask, RunTaskCallbacks } from "../schedule/runner.js";
import {
  commentaryFromAgentEvent,
  type GatewayHandle,
  type GatewayStreamEmitter,
} from "../gateway/stream-events.js";

export function buildGatewayHandle(runTask: RunTask): GatewayHandle {
  return async (text, images, emit) => {
    const outcome = await runTask(text, undefined, images, callbacksFor(emit));
    return outcome.finalText;
  };
}

function callbacksFor(emit: GatewayStreamEmitter | undefined): RunTaskCallbacks | undefined {
  if (!emit) return undefined;
  return {
    onTextDelta: (text) => emit({ type: "MessageChunk", text }),
    onEvent: (event) => {
      const text = commentaryFromAgentEvent(event);
      if (text) emit({ type: "Commentary", text });
    },
  };
}
