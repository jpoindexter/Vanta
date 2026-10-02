/** Compatibility verbs vary in casing; targets, commands and payload bytes do not. */
export function sameEffectAction(left: string | undefined, right: string): boolean {
  const normalize = (value: string) => value.trim().replace(/^(Edit|Run|Write)\b/, (verb) => verb.toLowerCase());
  return left !== undefined && normalize(left) === normalize(right);
}
