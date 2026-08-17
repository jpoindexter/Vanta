import { useEffect, useState, type Dispatch, type ReactElement, type SetStateAction } from "react";
import { Box, Text, useInput } from "ink";
import { focusIndicator } from "./focus.js";
import { clipTo, termWidth } from "../term/width.js";
import { providerModelSettingsCapabilities, type ProviderEffortLevel, type ProviderSpeed } from "../providers/model-settings.js";

export type ModelPickChoice = {
  providerId: string;
  model: string;
  effort?: ProviderEffortLevel;
  speed?: ProviderSpeed;
  scope: "global" | "session";
};

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function effortLabel(value: ProviderEffortLevel): string {
  return value === "xhigh" ? "xHigh" : value === "ultra" ? "Ultra" : titleCase(value);
}

function cycle<T>(options: T[], current: T, direction: 1 | -1): T | undefined {
  const index = options.indexOf(current);
  return options[(index + direction + options.length) % options.length];
}

type PickState = {
  selectedIndex: number;
  model: string;
  effortOptions: ProviderEffortLevel[];
  effort?: ProviderEffortLevel;
  speedOptions: ProviderSpeed[];
  speed?: ProviderSpeed;
  setSelectedIndex: (index: number) => void;
  setEffortByModel: Dispatch<SetStateAction<Record<string, ProviderEffortLevel>>>;
  setSpeedByModel: Dispatch<SetStateAction<Record<string, ProviderSpeed>>>;
};

type PickKey = {
  escape?: boolean;
  tab?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
};

function handlePickKey(
  input: string,
  key: PickKey,
  state: PickState,
  count: number,
  props: { providerId: string; onApply: (choice: ModelPickChoice) => void; onSwitchProvider: () => void; onClose: () => void },
): void {
  if (key.escape) return void props.onClose();
  if (key.tab || input === "b" || input === "B") return void props.onSwitchProvider();
  if (key.upArrow) return void state.setSelectedIndex(Math.max(0, state.selectedIndex - 1));
  if (key.downArrow) return void state.setSelectedIndex(Math.min(count - 1, state.selectedIndex + 1));
  if ((key.leftArrow || key.rightArrow) && state.effortOptions.length > 1 && state.effort) {
    const next = cycle(state.effortOptions, state.effort, key.rightArrow ? 1 : -1);
    if (next) state.setEffortByModel((previous) => ({ ...previous, [state.model]: next }));
    return;
  }
  if ((input === "f" || input === "F") && state.speedOptions.length > 1 && state.speed) {
    const next = cycle(state.speedOptions, state.speed, 1);
    if (next) state.setSpeedByModel((previous) => ({ ...previous, [state.model]: next }));
    return;
  }
  const pick = { providerId: props.providerId, model: state.model, effort: state.effort, speed: state.speed };
  if (key.return && state.model) return void props.onApply({ ...pick, scope: "global" });
  if ((input === "s" || input === "S") && state.model) props.onApply({ ...pick, scope: "session" });
}
function ControlLine(props: { value: string; label: string; hint: string }): ReactElement {
  return <Text><Text color="yellow">  ● </Text><Text>{props.value} {props.label} </Text><Text dimColor>{props.hint}</Text></Text>;
}

export function ModelPickPanel(props: {
  providerId: string;
  providerLabel: string;
  models: string[];
  currentModel?: string;
  currentEffort?: ProviderEffortLevel;
  currentSpeed?: ProviderSpeed;
  focused?: boolean;
  onApply: (choice: ModelPickChoice) => void;
  onSwitchProvider: () => void;
  onClose: () => void;
}): ReactElement {
  const initial = Math.max(0, props.currentModel ? props.models.indexOf(props.currentModel) : 0);
  const [selectedIndex, setSelectedIndex] = useState(initial);
  const clamped = Math.min(Math.max(0, selectedIndex), Math.max(0, props.models.length - 1));
  const model = props.models[clamped] ?? props.currentModel ?? "";
  const current = model === props.currentModel;
  const capabilities = providerModelSettingsCapabilities(props.providerId, model, process.env);
  const effortOptions = capabilities.effort?.options ?? [];
  const speedOptions = capabilities.speed?.options ?? [];
  const defaultEffort = current && props.currentEffort && effortOptions.includes(props.currentEffort)
    ? props.currentEffort
    : capabilities.effort?.defaultValue;
  const defaultSpeed = current && props.currentSpeed && speedOptions.includes(props.currentSpeed)
    ? props.currentSpeed
    : capabilities.speed?.defaultValue;
  const [effortByModel, setEffortByModel] = useState<Record<string, ProviderEffortLevel>>({});
  const [speedByModel, setSpeedByModel] = useState<Record<string, ProviderSpeed>>({});
  const effort = effortByModel[model] ?? defaultEffort;
  const speed = speedByModel[model] ?? defaultSpeed;

  useEffect(() => setSelectedIndex(initial), [props.providerId, initial]);
  useInput((input, key) => handlePickKey(input, key, {
    selectedIndex: clamped,
    model,
    effortOptions,
    effort,
    speedOptions,
    speed,
    setSelectedIndex,
    setEffortByModel,
    setSpeedByModel,
  }, props.models.length, props));

  const width = termWidth();
  const nameColumn = Math.min(32, Math.max(...props.models.map((item) => item.length), 8));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{focusIndicator(props.focused !== false)} Select model</Text>
      <Text dimColor>{clipTo(`  ${props.providerLabel} · choose a model and its supported controls.`, width - 2)}</Text>
      <Text dimColor>{clipTo("  Enter sets the default for new sessions; s uses it this session only.", width - 2)}</Text>
      <Text> </Text>
      {props.models.length === 0
        ? <Text>  (no models discovered)</Text>
        : props.models.map((item, index) => (
            <Box key={item}>
              <Text color={index === clamped ? "cyan" : undefined}>{index === clamped ? "❯ " : "  "}</Text>
              <Text dimColor>{index + 1}. </Text>
              <Text color={index === clamped ? "cyan" : undefined} bold={index === clamped}>{clipTo(item, nameColumn).padEnd(nameColumn)}</Text>
              <Text>{item === props.currentModel ? " ✔" : ""}</Text>
            </Box>
          ))}
      <Text> </Text>
      {effort && effortOptions.length > 0 ? <ControlLine value={effortLabel(effort)} label="effort" hint="←/→ to adjust" /> : null}
      {speed && speedOptions.length > 0 ? <ControlLine value={titleCase(speed)} label="speed" hint="f to toggle" /> : null}
      <Text> </Text>
      <Text dimColor>{clipTo("  Enter default · s this session · b/Tab model setup · Esc cancel", width - 2)}</Text>
    </Box>
  );
}
