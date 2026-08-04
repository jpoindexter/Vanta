import { buildOperatorSpine, formatOperatorSpine } from "../work-items/operator-spine.js";

export async function runOperatorSpineCommand(
  root: string,
  options: { env?: NodeJS.ProcessEnv; now?: Date; log?: (line: string) => void } = {},
): Promise<number> {
  const snapshot = await buildOperatorSpine(root, { env: options.env, now: options.now });
  (options.log ?? console.log)(formatOperatorSpine(snapshot));
  return snapshot.integrity === "ok" ? 0 : 2;
}
