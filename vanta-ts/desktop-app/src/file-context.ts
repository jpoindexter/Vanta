export type ProjectFileContext = { files: string[]; changed: string[]; recent: string[] };
export type ProjectFileGroups = { changed: string[]; mentioned: string[]; recent: string[]; search: string[] };

export function fallbackProjectFileContext(files: string[]): ProjectFileContext {
  return { files, changed: [], recent: files.slice(0, 12) };
}

export function mentionedProjectFiles(files: string[], content: string[]): string[] {
  return files.filter((file) => content.some((entry) => entry.includes(`@${file}`) || entry.includes(file)));
}

export function groupProjectFiles(context: ProjectFileContext, mentioned: string[], query: string): ProjectFileGroups {
  const needle = query.trim().toLowerCase();
  const available = new Set(context.files);
  const changed = context.changed.filter((file) => available.has(file));
  const changedSet = new Set(changed);
  const task = mentioned.filter((file) => available.has(file) && !changedSet.has(file));
  const used = new Set([...changed, ...task]);
  const recent = context.recent.filter((file) => available.has(file) && !used.has(file));
  const search = needle ? context.files.filter((file) => file.toLowerCase().includes(needle)) : [];
  return { changed, mentioned: task, recent, search };
}
