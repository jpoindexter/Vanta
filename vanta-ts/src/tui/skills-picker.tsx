import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Overlay, OverlayRow } from "./overlay.js";
import type { Skill } from "../skills/types.js";

// In-TUI skill browser: search + navigate skills, Enter invokes, Esc closes.

function filterSkills(skills: readonly Skill[], q: string): Skill[] {
  if (!q.trim()) return [...skills];
  const lq = q.toLowerCase();
  return skills.filter(
    (s) => s.meta.name.toLowerCase().includes(lq) || s.meta.description.toLowerCase().includes(lq),
  );
}

type Props = {
  skills: Skill[];
  onInvoke: (name: string) => void;
  onCancel: () => void;
  width: number;
};

export function SkillsPicker({ skills, onInvoke, onCancel, width }: Props): ReactElement {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const filtered = filterSkills(skills, query).slice(0, 8);
  const clamped = Math.min(sel, Math.max(0, filtered.length - 1));

  useInput((_in, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.upArrow) { setSel((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow) { setSel((s) => Math.min(filtered.length - 1, s + 1)); return; }
    if (key.return) { const c = filtered[clamped]; if (c) onInvoke(c.meta.name); }
  });

  return (
    <Overlay title={`skills (${skills.length})`} hint="↑↓ navigate · ⏎ invoke · Esc close" keys="search above filters by name or description" width={width}>
      <Box paddingX={1}>
        <Text dimColor>/ </Text>
        <TextInput value={query} onChange={(v) => { setQuery(v); setSel(0); }} placeholder="filter…" />
      </Box>
      {filtered.length === 0
        ? <Text dimColor>  (no skills match "{query}")</Text>
        : filtered.map((s, i) => (
          <OverlayRow
            key={s.meta.name}
            selected={i === clamped}
            mark="●"
            markColor="cyan"
            label={s.meta.name}
            meta={s.meta.description.slice(0, 55)}
          />
        ))}
    </Overlay>
  );
}
