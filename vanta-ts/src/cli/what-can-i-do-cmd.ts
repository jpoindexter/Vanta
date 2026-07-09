import { buildRegistry } from "../tools/index.js";
import { formatWhatCanIDo, runColdActivationCheck, runWorkflowDemo, workflowViews } from "../repl/what-can-i-do-cmd.js";

export function runWhatCanIDoCommand(rest: string[] = []): number {
  if (rest[0] === "--demo") {
    console.log(runWorkflowDemo(rest[1] ?? ""));
    return 0;
  }
  const toolNames = buildRegistry().schemas().map((schema) => schema.name);
  if (rest[0] === "--check") {
    const result = runColdActivationCheck(toolNames);
    console.log(result.output);
    return result.ok ? 0 : 1;
  }
  console.log(formatWhatCanIDo(workflowViews(toolNames)));
  return 0;
}
