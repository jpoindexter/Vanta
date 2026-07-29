import { useMemo, useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { AskQuestion, AskUserResponse, ResolvedSelection } from "../tools/ask-user-model.js";

export type PendingQuestion = {
  questions: AskQuestion[];
  resolve: (response: AskUserResponse) => void;
};

type Answer = { selected: string[] };

const SECONDARY_TEXT = "#a3a3a3";
const MUTED_TEXT = "#858585";

export type OptionTone = {
  bold: boolean;
  descriptionColor: string;
  labelColor?: string;
};

export function optionTone(active: boolean): OptionTone {
  return active
    ? { bold: true, descriptionColor: SECONDARY_TEXT }
    : { bold: false, labelColor: SECONDARY_TEXT, descriptionColor: MUTED_TEXT };
}

export function AskUserPrompt(props: { pending: PendingQuestion; onDone: () => void }): ReactElement {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [otherInput, setOtherInput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cursorRef = useRef(0);
  const answersRef = useRef<Record<string, Answer>>({});
  const otherInputRef = useRef<string | null>(null);
  const question = props.pending.questions[questionIndex]!;
  const allowOther = question.allowOther !== false;
  const rowCount = question.options.length + (allowOther ? 1 : 0);
  const selected = answers[question.header]?.selected ?? [];
  const current = question.options[cursor];
  const preview = current?.preview;
  const otherActive = cursor === question.options.length;
  const otherTone = optionTone(otherActive);
  const moveCursor = (value: number): void => { cursorRef.current = value; setCursor(value); };
  const storeAnswers = (value: Record<string, Answer>): void => { answersRef.current = value; setAnswers(value); };
  const storeOther = (value: string | null): void => { otherInputRef.current = value; setOtherInput(value); };

  const finish = (nextAnswers: Record<string, Answer>): void => {
    const selections: ResolvedSelection[] = props.pending.questions.map((item) => ({
      header: item.header,
      selected: nextAnswers[item.header]?.selected ?? [],
    }));
    props.pending.resolve(selections);
    props.onDone();
  };

  const commit = (values: string[]): void => {
    if (!values.length) { setError("Pick at least one option."); return; }
    const nextAnswers = { ...answersRef.current, [question.header]: { selected: values } };
    if (questionIndex === props.pending.questions.length - 1) finish(nextAnswers);
    else {
      storeAnswers(nextAnswers);
      setQuestionIndex((index) => index + 1);
      moveCursor(0);
      setError("");
    }
  };

  const chooseCurrent = (): void => {
    const currentCursor = cursorRef.current;
    if (allowOther && currentCursor === question.options.length) {
      storeOther("");
      setError("");
      return;
    }
    const label = question.options[currentCursor]?.label;
    if (!label) return;
    if (!question.multiSelect) commit([label]);
    else toggle(label);
  };

  const toggle = (label: string): void => {
    const currentSelected = answersRef.current[question.header]?.selected ?? [];
    const next = currentSelected.includes(label) ? currentSelected.filter((item) => item !== label) : [...currentSelected, label];
    storeAnswers({ ...answersRef.current, [question.header]: { selected: next } });
    setError("");
  };

  const cancel = (): void => {
    props.pending.resolve(null);
    props.onDone();
  };

  useInput((input, key) => {
    if (otherInputRef.current !== null) {
      if (key.escape) { storeOther(null); return; }
      if (key.return) {
        const value = otherInputRef.current.trim();
        const currentSelected = answersRef.current[question.header]?.selected ?? [];
        if (value) commit(question.multiSelect ? [...currentSelected, value] : [value]);
        else setError("Type an answer or press Esc.");
        return;
      }
      if (key.backspace || key.delete) storeOther(otherInputRef.current.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) storeOther(`${otherInputRef.current}${input}`);
      return;
    }
    if (key.escape) { cancel(); return; }
    if (key.upArrow) { moveCursor((cursorRef.current - 1 + rowCount) % rowCount); return; }
    if (key.downArrow) { moveCursor((cursorRef.current + 1) % rowCount); return; }
    if (/^[1-5]$/.test(input)) {
      const index = Number(input) - 1;
      if (index < rowCount) moveCursor(index);
      return;
    }
    if (input === " " && question.multiSelect) { chooseCurrent(); return; }
    if (key.return) {
      if (question.multiSelect) commit(answersRef.current[question.header]?.selected ?? []);
      else chooseCurrent();
    }
  });

  const progress = useMemo(() => `${questionIndex + 1}/${props.pending.questions.length}`, [questionIndex, props.pending.questions.length]);
  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} marginTop={1}>
      <Text><Text color="cyan" bold>{question.header}</Text> <Text dimColor>{progress}</Text></Text>
      <Text bold>{question.question}</Text>
      <Box flexDirection="column" marginTop={1}>
        {question.options.map((option, index) => {
          const active = index === cursor;
          const tone = optionTone(active);
          return (
            <Text key={option.label}>
              <Text color={active ? "cyan" : tone.labelColor}>{active ? "❯" : " "} {index + 1}.</Text>{" "}
              <Text bold={tone.bold} color={tone.labelColor}>{question.multiSelect ? (selected.includes(option.label) ? "[x]" : "[ ]") : ""} {option.label}</Text>
              <Text color={tone.descriptionColor}> — {option.description}</Text>
            </Text>
          );
        })}
        {allowOther ? (
          <Text>
            <Text color={otherActive ? "cyan" : otherTone.labelColor}>{otherActive ? "❯" : " "} {question.options.length + 1}.</Text>{" "}
            <Text bold={otherTone.bold} color={otherTone.labelColor}>Other</Text><Text color={otherTone.descriptionColor}> — Type your own answer</Text>
          </Text>
        ) : null}
      </Box>
      {preview ? <Box marginTop={1} flexDirection="column"><Text bold>Preview</Text><Text>{preview}</Text></Box> : null}
      {otherInput !== null ? <Box marginTop={1}><Text color="cyan">› </Text><Text>{otherInput || "Type your answer…"}</Text></Box> : null}
      {error ? <Text color="yellow">{error}</Text> : null}
      <Text dimColor>{otherInput !== null ? "Enter submit · Esc back" : question.multiSelect ? "Space select · Enter continue · Esc cancel" : "↑↓ choose · Enter select · Esc cancel"}</Text>
    </Box>
  );
}
