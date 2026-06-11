import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Overlay, OverlayRow } from "./overlay.js";
import type { ProviderEntry } from "../providers/catalog.js";

// The /model picker — UI for switching providers and models. A
// two-step wizard (provider → model) with an optional key-entry step for
// providers missing their API key. The type-to-filter doubles as free-text
// entry: ⏎ on a query that matches no curated model accepts the raw string, so
// OpenRouter's 200+ and Ollama's local models stay reachable. On select the App
// rebuilds the provider and hot-swaps it into the live conversation. Modeled on
// In-process model picker — no gateway, reads providers/catalog.

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

function KeyStageView(props: {
  chosen: ProviderEntry;
  keyInput: string;
  setKeyInput: (v: string) => void;
  setEnteredKey: (v: string) => void;
  width: number;
  reset: (next: Stage) => void;
}): ReactElement {
  const { chosen, keyInput, setKeyInput, setEnteredKey, width, reset } = props;
  return (
    <Overlay title={`Enter ${chosen.short} API key`} hint={`Stored in vanta-ts/.env (${chosen.envVar}). ⏎ to continue · Esc back`} width={width}>
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

function ModelStageView(props: {
  chosen: ProviderEntry;
  currentProviderId: string;
  currentModel: string;
  modelRows: string[];
  modelCur: number;
  filter: string;
  keys: string;
  width: number;
}): ReactElement {
  const { chosen, currentProviderId, currentModel, modelRows, modelCur, filter, keys, width } = props;
  const free = modelRows.length === 0 && filter.trim() !== "";
  return (
    <Overlay title={`Select model — ${chosen.short}`} hint="step 2 / 2 · ⏎ choose · Esc back to providers" keys={keys} width={width}>
      {modelRows.map((m, i) => {
        const isCur = chosen.id === currentProviderId && m === currentModel;
        return <OverlayRow key={m} selected={i === modelCur} mark={isCur ? "*" : "·"} markColor={isCur ? "cyan" : "gray"} label={m} />;
      })}
      <Text dimColor>
        filter: <Text color="white">{filter || " "}</Text>
        {free ? <Text color="yellow">  ⏎ uses "{filter.trim()}" as a custom model id</Text> : null}
      </Text>
    </Overlay>
  );
}

function ProviderStageView(props: {
  provRows: ProviderEntry[];
  provCur: number;
  currentProviderId: string;
  currentModel: string;
  filter: string;
  keys: string;
  width: number;
  hasKey: (entry: ProviderEntry) => boolean;
}): ReactElement {
  const { provRows, provCur, currentProviderId, currentModel, filter, keys, width, hasKey } = props;
  return (
    <Overlay title="Select provider" hint={`step 1 / 2 · current: ${currentModel}`} keys={keys} width={width}>
      {provRows.map((p, i) => {
        const m = providerMark(p, p.id === currentProviderId, hasKey(p));
        return <OverlayRow key={p.id} selected={i === provCur} mark={m.mark} markColor={m.color} label={p.short} meta={m.meta} />;
      })}
      <Text dimColor>
        filter: <Text color="white">{filter || " "}</Text>
      </Text>
    </Overlay>
  );
}

type KeyType = { escape?: boolean; ctrl?: boolean; meta?: boolean; tab?: boolean; upArrow?: boolean; downArrow?: boolean; return?: boolean; backspace?: boolean; delete?: boolean };

type NavArgs = {
  rows: number;
  setIdx: (fn: (i: number) => number) => void;
  setPersistGlobal: (fn: (g: boolean) => boolean) => void;
};

function handleNavKey(input: string, key: KeyType, args: NavArgs): boolean {
  if (key.ctrl && input === "g") { args.setPersistGlobal((g) => !g); return true; }
  if (key.upArrow) { args.setIdx((i) => (args.rows ? (i - 1 + args.rows) % args.rows : 0)); return true; }
  if (key.downArrow) { args.setIdx((i) => (args.rows ? (i + 1) % args.rows : 0)); return true; }
  return false;
}

type ReturnArgs = {
  stage: Stage;
  chosen: ProviderEntry;
  chosenHasKey: boolean;
  reset: (next: Stage) => void;
  commit: () => void;
};

function handleReturnKey(args: ReturnArgs): void {
  if (args.stage === "provider") {
    if (args.chosen.envVar !== null && !args.chosenHasKey) { args.reset("key"); return; }
    args.reset("model"); return;
  }
  args.commit();
}

type EscArgs = {
  filter: string;
  stage: Stage;
  setFilter: (fn: (f: string) => string) => void;
  reset: (next: Stage) => void;
  onCancel: () => void;
};

function handleEscKey(args: EscArgs): void {
  if (args.filter) { args.setFilter(() => ""); return; }
  if (args.stage === "model") { args.reset("provider"); return; }
  args.onCancel();
}

type PickerState = {
  stage: Stage;
  filter: string;
  chosen: ProviderEntry;
  provRows: readonly ProviderEntry[];
  modelRows: string[];
  provCur: number;
  modelCur: number;
  persistGlobal: boolean;
  setFilter: (fn: (f: string) => string) => void;
  setProviderIdx: (fn: (i: number) => number) => void;
  setModelIdx: (fn: (i: number) => number) => void;
  setPersistGlobal: (fn: (g: boolean) => boolean) => void;
  reset: (next: Stage) => void;
  keyInput: string;
  setKeyInput: (v: string) => void;
  setEnteredKey: (v: string) => void;
};

function useModelPickerState(providers: readonly ProviderEntry[], currentProviderId: string): PickerState {
  const [stage, setStage] = useState<Stage>("provider");
  const [providerIdx, setProviderIdx] = useState(() =>
    Math.max(0, providers.findIndex((p) => p.id === currentProviderId)),
  );
  const [modelIdx, setModelIdx] = useState(0);
  const [filter, setFilter] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [enteredKey, setEnteredKey] = useState("");
  const [persistGlobal, setPersistGlobal] = useState(true);

  const provRows = stage === "provider" ? fuzzyFilter(providers, filter, (p) => `${p.short} ${p.id} ${p.label}`) : providers;
  const provCur = Math.min(providerIdx, Math.max(0, provRows.length - 1));
  const chosen = provRows[provCur] ?? providers[0]!;
  const modelRows = stage === "model" ? fuzzyFilter(chosen.models, filter, (m) => m) : chosen.models;
  const modelCur = Math.min(modelIdx, Math.max(0, modelRows.length - 1));
  const reset = (next: Stage): void => { setStage(next); setFilter(""); setModelIdx(0); };
  return {
    stage, filter, chosen, provRows, modelRows, provCur, modelCur, persistGlobal, enteredKey,
    setFilter: (fn) => setFilter((f) => fn(f)), setProviderIdx, setModelIdx, setPersistGlobal, reset,
    keyInput, setKeyInput, setEnteredKey,
  } as PickerState & { enteredKey: string };
}

function handleFilterInput(
  input: string,
  key: KeyType,
  setFilter: (fn: (f: string) => string) => void,
): void {
  if (key.backspace || key.delete) { setFilter((f) => f.slice(0, -1)); return; }
  if (input && !key.ctrl && !key.meta && !key.tab) setFilter((f) => f + input);
}

type InputHookProps = {
  ps: PickerState & { enteredKey: string };
  hasKey: (e: ProviderEntry) => boolean;
  onSelect: (sel: ModelSelection) => void;
  onCancel: () => void;
  isActive: boolean;
};

function useModelPickerInput(opts: InputHookProps): void {
  const { ps, hasKey, onSelect, onCancel, isActive } = opts;
  const { stage, filter, chosen, provRows, modelRows, modelCur, persistGlobal, enteredKey,
    setFilter, setProviderIdx, setModelIdx, setPersistGlobal, reset } = ps;
  const rows = stage === "provider" ? provRows.length : modelRows.length;
  const setIdx = stage === "provider" ? setProviderIdx : setModelIdx;
  const fullChosenHasKey = chosen.envVar === null || hasKey(chosen) || enteredKey !== "";
  const commit = (): void => {
    const model = modelRows[modelCur] ?? filter.trim();
    if (!model) return;
    onSelect({ providerId: chosen.id, model, apiKey: enteredKey || undefined, persistGlobal });
  };
  useInput(
    (input, key) => {
      if (stage === "key") { if (key.escape) reset("provider"); return; }
      if (key.escape) { handleEscKey({ filter, stage, setFilter, reset, onCancel }); return; }
      if (handleNavKey(input, key, { rows, setIdx, setPersistGlobal })) return;
      if (key.return) { handleReturnKey({ stage, chosen, chosenHasKey: fullChosenHasKey, reset, commit }); return; }
      handleFilterInput(input, key, setFilter);
    },
    { isActive },
  );
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
  const ps = useModelPickerState(props.providers, props.currentProviderId) as PickerState & { enteredKey: string };
  const { stage, filter, chosen, provRows, modelRows, provCur, modelCur, persistGlobal,
    keyInput, setKeyInput, setEnteredKey, reset } = ps;
  useModelPickerInput({ ps, hasKey: props.hasKey, onSelect: props.onSelect, onCancel: props.onCancel, isActive: props.isActive ?? true });

  const persistLabel = persistGlobal ? "global (.env)" : "session";
  const keys = `persist: ${persistLabel} · ^g toggle  |  ↑↓ select · ⏎ choose · Esc back · type to filter`;

  if (stage === "key") {
    return <KeyStageView chosen={chosen} keyInput={keyInput} setKeyInput={setKeyInput}
      setEnteredKey={setEnteredKey} width={props.width} reset={reset} />;
  }
  if (stage === "model") {
    return <ModelStageView chosen={chosen} currentProviderId={props.currentProviderId}
      currentModel={props.currentModel} modelRows={[...modelRows]} modelCur={modelCur}
      filter={filter} keys={keys} width={props.width} />;
  }
  return <ProviderStageView provRows={[...provRows]} provCur={provCur}
    currentProviderId={props.currentProviderId} currentModel={props.currentModel}
    filter={filter} keys={keys} width={props.width} hasKey={props.hasKey} />;
}
