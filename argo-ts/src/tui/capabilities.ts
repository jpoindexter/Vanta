// Group Argo's tools into capability DOMAINS for the startup banner, so the
// breadth reads like a personal operator (comms, research, dev, …) rather than a
// flat tool dump — the Hermes banner pattern. Pure + data-driven: add a tool and
// it lands in the right domain by name, or in "Other" if it matches nothing.

export type CapabilityDomain = { label: string; tools: string[] };

const DOMAINS: ReadonlyArray<{ label: string; match: (name: string) => boolean }> = [
  { label: "Files", match: (n) => /^(read_file|write_file|edit_file|list_dir)$/.test(n) },
  { label: "Code & shell", match: (n) => /^(shell_cmd|run_code|lsp_)/.test(n) },
  { label: "Web & research", match: (n) => /^web_/.test(n) },
  { label: "Browser & vision", match: (n) => /^(browser_|screenshot|describe_image)/.test(n) },
  { label: "Git", match: (n) => /^git_/.test(n) },
  { label: "Comms (email · calendar · drive)", match: (n) => /^(gmail_|calendar_|drive_)/.test(n) },
  { label: "Memory & skills", match: (n) => /^(recall|write_skill)$/.test(n) },
  { label: "Orchestration", match: (n) => /^(delegate|cron)/.test(n) },
  { label: "Operator & safety", match: (n) => /^(inspect_state|goal|snapshot|rollback)/.test(n) },
];

/** Group tool names by domain, in a fixed order, dropping empty domains. Names
 *  matching no domain collect under "Other". */
export function groupToolsByDomain(names: string[]): CapabilityDomain[] {
  const out: CapabilityDomain[] = [];
  const claimed = new Set<string>();
  for (const { label, match } of DOMAINS) {
    const tools = names.filter((n) => match(n));
    for (const t of tools) claimed.add(t);
    if (tools.length) out.push({ label, tools });
  }
  const other = names.filter((n) => !claimed.has(n));
  if (other.length) out.push({ label: "Other", tools: other });
  return out;
}
