export type ModelPickApply = {
  providerId: string;
  model: string;
  effort?: string;
  speed?: string;
  scope: "global" | "session";
};

/** Apply visual picks through the same slash-command path as typed changes. */
export function runModelPick(choice: ModelPickApply, runSlash: (line: string) => unknown): Promise<unknown> {
  const flag = choice.scope === "global" ? "--global" : "--session";
  const model = choice.scope === "global"
    ? `/model --global ${choice.providerId} ${choice.model}`
    : `/model ${choice.providerId} ${choice.model}`;
  let applied = Promise.resolve(runSlash(model));
  if (choice.effort) applied = applied.then(() => runSlash(`/effort ${choice.effort} ${flag}`));
  if (choice.speed) applied = applied.then(() => runSlash(`/speed ${choice.speed} ${flag}`));
  return applied;
}
