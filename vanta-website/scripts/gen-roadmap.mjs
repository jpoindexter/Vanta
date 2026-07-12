// Generate the public roadmap page from the repo-root roadmap.json.
// Regenerate with:  node scripts/gen-roadmap.mjs   (also runs via `prebuild`)
//
// This page is PUBLIC: internal strategy framing, competitor benchmarking, and
// subscription-provider provenance are scrubbed, and the 900+ shipped cards are
// summarised (recent changes + a count) rather than dumped wholesale.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const roadmapPath = join(here, '..', '..', 'roadmap.json');
const roadmap = JSON.parse(readFileSync(roadmapPath, 'utf8'));
const items = Array.isArray(roadmap.items) ? roadmap.items : [];
if (items.length === 0) throw new Error(`gen-roadmap: no items found in ${roadmapPath}`);

// ---- scrub: keep the page Vanta-native and strategy-free ----
// Drop parenthetical asides that carry internal strategy / competitor / provenance.
const stripAsides = (s) =>
  String(s).replace(/\s*\([^)]*\b(hermes|openclaw|claude|codex|chatgpt|wedge|\d+\+)\b[^)]*\)/gi, '').trim();
const scrub = (s) =>
  stripAsides(s)
    .replace(/\bclaude[\s-]?code\b/gi, 'other agents')
    .replace(/\bchatgpt\b/gi, 'other agents')
    .replace(/\s*\bcodex\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
// MDX reads <foo> as JSX and {…} as expressions — escape so prose stays literal.
const mdx = (s) =>
  String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const clean = (s) => mdx(scrub(s));
// A public description: the half of the summary before the internal "Community
// signal …" note, minus any sentence that names a competitor (titles may keep a
// competitor name where it's a migrate/import feature; prose never does).
const cleanDesc = (c) => {
  const base = String(c.summary || '').split(/Community signal/i)[0];
  const kept = base.split(/(?<=\.)\s+/).filter((s) => !/\b(hermes|openclaw)\b/i.test(s));
  return clean(kept.join(' ')).replace(/[\s.]+$/, '');
};
// A title still mentioning a competitor/strategy word after scrub (outside a migrate/import
// feature) is internal framing — keep it out of the public horizon samples.
const leaky = (s) => /\b(hermes|openclaw|wedge)\b/i.test(scrub(s)) && !/migrat|import/i.test(s);

const byStatus = (st) => items.filter((c) => (c.status || '').toLowerCase() === st);
const next = byStatus('next');
const building = byStatus('building');
const inFlight = [...building, ...next];
const shipped = byStatus('shipped');
const horizon = byStatus('horizon');

const recent = [...shipped]
  .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')))
  .slice(0, 20);

const tracks = [...new Set(horizon.map((c) => c.track || 'Other'))].sort();

const out = [];
out.push('---', 'id: roadmap', 'title: Roadmap', 'sidebar_position: 1', '---', '');
out.push('# Roadmap', '');
out.push(
  'Where Vanta is headed and what just shipped — generated straight from the project board, so it never goes stale.',
  '',
);
out.push(
  `_${shipped.length} capabilities shipped · ${inFlight.length} in flight · ${horizon.length} on the horizon. Updated ${roadmap.updated || 'recently'}._`,
  '',
);

out.push('## In flight', '');
out.push('What we are actively building next.', '');
if (inFlight.length === 0) out.push('_Nothing in flight right now — see the horizon below._', '');
for (const c of inFlight) {
  out.push(`### ${clean(c.title)}`, '');
  out.push(`**${c.track}** · ${c.size || 'M'}-size`, '');
  const d = cleanDesc(c);
  if (d) out.push(d, '');
}

out.push('## Recently shipped', '');
out.push(`The latest of ${shipped.length}+ capabilities. See the [changelog](./changelog) for curated milestones.`, '');
for (const c of recent) {
  out.push(`- **${clean(c.title)}** — ${c.track}${c.updated ? ` · ${c.updated}` : ''}`);
}
out.push('');

out.push('## On the horizon', '');
out.push('Directional, not committed — grouped by area, newest thinking first.', '');
for (const track of tracks) {
  const inTrack = horizon.filter((c) => (c.track || 'Other') === track);
  const samples = inTrack.filter((c) => !leaky(c.title)).slice(0, 6);
  out.push(`### ${track} — ${inTrack.length} planned`, '');
  for (const c of samples) out.push(`- ${clean(c.title)}`);
  if (inTrack.length > samples.length) out.push(`- _…and ${inTrack.length - samples.length} more_`);
  out.push('');
}

writeFileSync(join(here, '..', 'docs', 'roadmap.md'), out.join('\n'));
console.log(`gen-roadmap: wrote docs/roadmap.md (${building.length} building, ${next.length} next, ${recent.length} recent, ${horizon.length} horizon across ${tracks.length} tracks)`);
