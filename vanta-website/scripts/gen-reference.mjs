// Generate the full tool + command reference pages from reference-data.json.
// Regenerate the data from the agent layer with:
//   cd ../vanta-ts && npx tsx scripts/dump-reference.ts > ../vanta-website/scripts/reference-data.json
// then: node scripts/gen-reference.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'reference-data.json'), 'utf8'));
const docs = join(here, '..', 'docs', 'reference');

// ---- category maps (anything unmapped falls into "Other") ----
const TOOL_CATEGORIES = [
  ['Files & code', ['read_file','write_file','edit_file','grep_files','glob_files','shell_cmd','run_code','lsp_diagnostics','lsp_definition','git_status','git_diff','git_commit','git_push','git_branch','git_checkout','github_read','regression_lock','protect']],
  ['Web, search & reach', ['web_search','web_fetch','rss_read','reddit_read','twitter_read','linkedin_read','youtube_read','podcast_read','watch_video','x','reach','cookie_import']],
  ['Browser, vision & voice', ['browser_navigate','browser_act','browser_extract','browser_read','screenshot','describe_image','compare_vision','look_at_screen','look_at_camera','transcribe','speak']],
  ['Comms', ['gmail_search','gmail_read','gmail_draft','gmail_send','calendar_read','calendar_create','calendar_update','drive_read','drive_create','drive_update','send_message']],
  ['Autonomy & multi-agent', ['delegate','swarm','compose_workflow','team','cron_create','cron_list','bg_list','bg_status','watch','loop','sleep','only']],
  ['Memory, knowledge & learning', ['brain','recall','write_skill','ref_ingest','ref_search','ref_list','retrieve_original','graph_query','playbook','clarify','inspect_state','todo']],
  ['Operator systems', ['world','money','radar','life_search','self_repair']],
  ['Roadmap & meta', ['roadmap_add','roadmap_move','tool_search','mount_mcp','list_mcp_resources','read_mcp_resource','config']],
];

const COMMAND_CATEGORIES = [
  ['Session & history', ['help','clear','reset','history','export','retry','undo','rewind','title','fork','restart','exit']],
  ['Goals & focus', ['goal','goals','next','now','plan','planmode','boundary','where','wm']],
  ['Model & config', ['model','models','effort','setup','config','settings','usage','update']],
  ['Tools, skills & knowledge', ['tools','skills','recall','memory','moim','context','compress','compact','hooks','mcp','permissions','preferences']],
  ['Deep work', ['ultrathink','ultracode','deep-research','skeptic','brief','review','simplify','auto','verify','repro','summary','audit']],
  ['Operator views', ['world','money','radar','team','lifesearch','compartments','locks','reach','cookie','dashboard','health','today']],
  ['Files, edits & input', ['files','open','edit','diff','changes','search','image','paste','attachments','add-dir','import']],
  ['Project & lifecycle', ['init','roadmap','loops','cron','tasks','branch','routes','rename','lint']],
  ['Sessions & continuity', ['sessions','resume','handoff','bug','copy']],
  ['UI', ['cockpit','tui','focus','composer','output-style']],
];

// Keep docs Vanta-native: strip Claude-Code / Hermes / subscription-provider mentions.
const scrub = (s) => String(s)
  .replace(/\.claude\/CLAUDE\.md(\s+project context)?/g, 'a project context file')
  .replace(/\s*[|,]\s*codex\b/gi, '')
  .replace(/\s*[|,]\s*claude-code\b/gi, '')
  .replace(/\bclaude[\s-]?code\b/gi, 'the agent')
  .replace(/\bhermes\b/gi, '')
  .replace(/\bchatgpt\b/gi, '');

// MDX reads <foo> as JSX and {…} as expressions — escape them so prose stays literal.
const mdx = (s) => String(s)
  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');

const esc = (s) => mdx(scrub(String(s))).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

function categorize(items, cats, key) {
  const byName = new Map(items.map((i) => [i[key], i]));
  const used = new Set();
  const groups = [];
  for (const [label, names] of cats) {
    const rows = names.map((n) => byName.get(n)).filter(Boolean);
    rows.forEach((r) => used.add(r[key]));
    if (rows.length) groups.push([label, rows]);
  }
  const leftover = items.filter((i) => !used.has(i[key])).sort((a, b) => a[key].localeCompare(b[key]));
  if (leftover.length) groups.push(['Other', leftover]);
  return groups;
}

function paramTable(parameters) {
  const props = parameters?.properties;
  if (!props || !Object.keys(props).length) return '_No parameters._\n';
  const required = new Set(parameters.required ?? []);
  let out = '| Param | Type | Required | Description |\n|---|---|---|---|\n';
  for (const [name, spec] of Object.entries(props)) {
    const type = spec.type ?? (spec.enum ? `enum(${spec.enum.join('\\|')})` : 'any');
    out += `| \`${name}\` | ${esc(type)} | ${required.has(name) ? 'yes' : 'no'} | ${esc(spec.description ?? '')} |\n`;
  }
  return out;
}

// ---- tools page ----
const toolGroups = categorize(data.tools, TOOL_CATEGORIES, 'name');
let tools = `---
id: tools-list
title: Tool reference
sidebar_position: 3
---

# Tool reference

Every built-in tool, generated directly from the source registry — **${data.tools.length} tools**. Each call is gated by the kernel before it runs (tools marked _safety-checked_ send a safety descriptor to the kernel). The model sees a per-turn scoped subset; \`tool_search\` pulls in the rest on demand.

`;
for (const [label, rows] of toolGroups) {
  tools += `## ${label}\n\n`;
  for (const t of rows) {
    tools += `### \`${t.name}\`\n\n${mdx(scrub(t.description)) || '_No description._'}\n\n${paramTable(t.parameters)}\n`;
    tools += t.hasSafety ? `_Safety-checked: sends a descriptor to the kernel for classification._\n\n` : `\n`;
  }
}
writeFileSync(join(docs, 'tools-list.md'), tools);

// ---- commands page ----
const cmdGroups = categorize(data.commands, COMMAND_CATEGORIES, 'name');
let cmds = `---
id: commands-list
title: Command reference
sidebar_position: 4
---

# Command reference

Every slash command, generated from the command catalog — **${data.commands.length} commands**. Type any of these in an interactive session; \`/help\` prints the live list.

`;
for (const [label, rows] of cmdGroups) {
  cmds += `## ${label}\n\n| Command | Description |\n|---|---|\n`;
  for (const c of rows) cmds += `| \`/${c.name}\` | ${esc(c.desc) || '—'} |\n`;
  cmds += '\n';
}
writeFileSync(join(docs, 'commands-list.md'), cmds);

console.log(`generated tools-list.md (${data.tools.length} tools) + commands-list.md (${data.commands.length} commands)`);
