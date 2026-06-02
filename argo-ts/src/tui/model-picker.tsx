import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Overlay, OverlayRow } from "./overlay.js";
import type { ProviderEntry } from "../providers/catalog.js";

// The /model picker (docs/hermes-model.html tab 3) — the headline gap. A
// two-step wizard (provider → model) with an optional key-entry step for
// providers missing their API key. The type-to-filter doubles as free-text
// entry: ⏎ on a query that matches no curated model accepts the raw string, so
// OpenRouter's 200+ and Ollama's local models stay reachable. On select the App
// rebuilds the provider and hot-swaps it into the live conversation. Modeled on
// Hermes' modelPicker.tsx but in-process — no gateway, reads providers/catalog.

type Stage = "provider" | "key" | "model";

export type ModelSelection = {
  providerId: string;
  model: string;
  apiKey?: string;
  persistGlobal: boolean;
};

/** Subsequence/substring rank: contiguous matches first (by position), then
 * scattered subsequence matches, then drop non-matches. Lower score = better. */
function score(haystack: string, q: string): number {
  const s = haystack.toLowerCase();
  const idx = s.indexOf(q);
  if (idx >= 0) return idx;
  let qi = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      if (first < 0) first = i;
      last = i;
      qi++;
    }
  }
  return qi === q.length ? 1000 + (last - first) : -1;
}

export function fuzzyFilter<T>(items: readonly T[], query: string, key: (t: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items
    .map((item) => ({ item, s: score(key(item), q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.item);
}

function providerMark(entry: ProviderEntry, isCurrent: boolean, hasKey: boolean): { mark: string; color: string; meta: string } {
  if (isCurrent) return { mark: "*", color: "cyan", meta: `· ${entry.models.length} models` };
  if (entry.envVar === null || hasKey) return { mark: "●", color: "green", meta: `· ${entry.models.length} models` };
  return { mark: "○", color: "gray", meta: "· (no key)" };
}

export function ModelPicker(props: {
  providers: readonly ProviderEntry[];
  currentProviderId: string;
  currentModel: string;
  hasKey: (entry: ProviderEntry) => boolean;
  width: number;
  isActive?: boolean;
  onSelect: (sel: ModelSelection) => void;
  onCancel: () => void;
}): ReactElement {
  const [stage, setStage] = useState<Stage>("provider");
  const [providerIdx, setProviderIdx] = useState(() =>
    Math.max(0, props.providers.findIndex((p) => p.id === props.currentProviderId)),
  );
  const [modelIdx, setModelIdx] = useState(0);
  const [filter, setFilter] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [enteredKey, setEnteredKey] = useState("");
  const [persistGlobal, setPersistGlobal] = useState(false);

  const provRows = stage === "provider" ? fuzzyFilter(props.providers, filter, (p) => `${p.short} ${p.id} ${p.label}`) : props.providers;
  const provCur = Math.min(providerIdx, Math.max(0, provRows.length - 1));
  const chosen = provRows[provCur] ?? props.providers[0]!;
  const chosenHasKey = chosen.envVar === null || props.hasKey(chosen) || enteredKey !== "";

  const modelRows = stage === "model" ? fuzzyFilter(chosen.models, filter, (m) => m) : chosen.models;
  const modelCur = Math.min(modelIdx, Math.max(0, modelRows.length - 1));

  const reset = (next: Stage): void => {
    setStage(next);
    setFilter("");
    setModelIdx(0);
  };

  const commit = (): void => {
    const model = modelRows[modelCur] ?? filter.trim();
    if (!model) return;
    props.onSelect({ providerId: chosen.id, model, apiKey: enteredKey || undefined, persistGlobal });
  };

  useInput(
    (input, key) => {
      if (stage === "key") {
        if (key.escape) reset("provider");
        return; // TextInput owns typing + ⏎ in the key stage
      }
      const rows = stage === "provider" ? provRows.length : modelRows.length;
      if (key.escape) {
        if (filter) return setFilter("");
        if (stage === "model") return reset("provider");
        return props.onCancel();
      }
      if (key.ctrl && input === "g") return setPersistGlobal((g) => !g);
      const setIdx = stage === "provider" ? setProviderIdx : setModelIdx;
      if (key.upArrow) return setIdx((i) => (rows ? (i - 1 + rows) % rows : 0));
      if (key.downArrow) return setIdx((i) => (rows ? (i + 1) % rows : 0));
      if (key.return) {
        if (stage === "provider") {
          if (chosen.envVar !== null && !chosenHasKey) return reset("key");
          return reset("model");
        }
        return commit();
      }
      if (key.backspace || key.delete) return setFilter((f) => f.slice(0, -1));
      if (input && !key.ctrl && !key.meta && !key.tab) return setFilter((f) => f + input);
    },
    { isActive: props.isActive ?? true },
  );

  const persistLabel = persistGlobal ? "global (.env)" : "session";
  const keys = `persist: ${persistLabel} · ^g toggle  |  ↑↓ select · ⏎ choose · Esc back · type to filter`;

  if (stage === "key") {
    return (
      <Overlay title={`Enter ${chosen.short} API key`} hint={`Stored in argo-ts/.env (${chosen.envVar}). ⏎ to continue · Esc back`} width={props.width}>
        <Box>
          <Text color="cyan">{"› "}</Text>
          <TextInput value={keyInput} onChange={setKeyInput} mask="•" onSubmit={(v) => {
            if (!v.trim()) return;
            setEnteredKey(v.trim());
            setKeyInput("");
            reset("model");
          }} />
        </Box>
      </Overlay>
    );
  }

  if (stage === "model") {
    const free = modelRows.length === 0 && filter.trim() !== "";
    return (
      <Overlay title={`Select model — ${chosen.short}`} hint="step 2 / 2 · ⏎ choose · Esc back to providers" keys={keys} width={props.width}>
        {modelRows.map((m, i) => {
          const isCur = chosen.id === props.currentProviderId && m === props.currentModel;
          return <OverlayRow key={m} selected={i === modelCur} mark={isCur ? "*" : "·"} markColor={isCur ? "cyan" : "gray"} label={m} />;
        })}
        <Text dimColor>
          filter: <Text color="white">{filter || " "}</Text>
          {free ? <Text color="yellow">  ⏎ uses "{filter.trim()}" as a custom model id</Text> : null}
        </Text>
      </Overlay>
    );
  }

  return (
    <Overlay title="Select provider" hint={`step 1 / 2 · current: ${props.currentModel}`} keys={keys} width={props.width}>
      {provRows.map((p, i) => {
        const m = providerMark(p, p.id === props.currentProviderId, props.hasKey(p));
        return <OverlayRow key={p.id} selected={i === provCur} mark={m.mark} markColor={m.color} label={p.short} meta={m.meta} />;
      })}
      <Text dimColor>
        filter: <Text color="white">{filter || " "}</Text>
      </Text>
    </Overlay>
  );
}
