// Pure data helpers for the collapsed tool-group summary line.
// No Ink imports — safe to import from any TUI module without circularity.

type ToolMember = { name: string; verb: string };

const TOOL_COUNT: Record<string, string> = {
  read_file: "file",
  write_file: "file",
  list_directory: "dir",
  shell_cmd: "shell",
  web_search: "search",
  web_fetch: "fetch",
  describe_image: "image",
  look_at_screen: "image",
  look_at_camera: "image",
  screenshot: "screenshot",
  browser_navigate: "page",
  browser_extract: "page",
  run_code: "run",
  ts_diagnostics: "diag",
  ts_definition: "def",
  git_status: "git",
  git_diff: "git",
  git_commit: "git",
  git_push: "git",
  git_branch: "git",
  git_checkout: "git",
  gmail_search: "email",
  gmail_read: "email",
  gmail_draft: "email",
  gmail_send: "email",
  calendar_read: "event",
  calendar_create: "event",
  calendar_update: "event",
  drive_read: "file",
  drive_create: "file",
  drive_update: "file",
  delegate: "agent",
  clarify: "question",
  recall: "memory",
  write_skill: "skill",
  brain: "memory",
  roadmap_add: "card",
  roadmap_move: "card",
  mount_mcp: "mcp",
  inspect_state: "state",
};

const IRREGULAR: Record<string, string> = { memory: "memories", mcp: "mcp", search: "searches" };

function pluralize(cat: string, n: number): string {
  return n === 1 ? cat : (IRREGULAR[cat] ?? `${cat}s`);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** Build the collapsed summary for a completed tool group.
 * Returns unique verb list (first capitalized) and count-by-category string. */
export function summarizeGroup(members: ReadonlyArray<ToolMember>): { verbs: string[]; counts: string } {
  const seen = new Set<string>();
  const verbs: string[] = [];
  for (const m of members) {
    const v = m.verb.toLowerCase();
    if (!seen.has(v)) {
      seen.add(v);
      verbs.push(verbs.length === 0 ? capitalize(v) : v);
    }
  }

  const cats = new Map<string, number>();
  for (const m of members) {
    const cat = TOOL_COUNT[m.name] ?? "op";
    cats.set(cat, (cats.get(cat) ?? 0) + 1);
  }

  const counts = [...cats.entries()]
    .map(([cat, n]) => `${n} ${pluralize(cat, n)}`)
    .join(", ");

  return { verbs, counts };
}
