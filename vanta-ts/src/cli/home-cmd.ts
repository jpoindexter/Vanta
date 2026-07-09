import { buildRegistry } from "../tools/index.js";
import { buildOperatorHome } from "../operator-home/view.js";

export async function runHomeCommand(dataDir: string, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const toolNames = buildRegistry().schemas().map((schema) => schema.name);
  console.log(await buildOperatorHome({ dataDir, env, toolNames }));
  return 0;
}
