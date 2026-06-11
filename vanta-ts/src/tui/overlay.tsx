import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { Box, Text } from "ink";
import { resolveTheme } from "./theme.js";

// Shared chrome for the floating pickers (sessions, model, skills, approval):
// the bordered box plus its rows. The selected row renders as a full-width
// accent bar (dark text on the theme accent) instead of a coloured marker —
// the design-language treatment from docs/design-refs/tui-demo.html. Accent and
// inner width flow to every OverlayRow through context, so the three pickers
// share one look without threading props or hard-coding cyan.

type OverlayCtx = { inner: number; accent: string };
const Ctx = createContext<OverlayCtx>({ inner: 40, accent: "cyan" });

/** Resolve the overlay accent: an explicit prop wins (approval passes yellow),
 * otherwise the active theme's accent — so the pickers track VANTA_THEME. */
export function overlayAccent(propColor: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return propColor ?? resolveTheme(env).accent;
}

/** Pad (or clip) a plain string to exactly `width` cells — the body of a
 * full-width selection bar so the accent background spans the whole row. */
export function fillRow(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

export function Overlay(props: {
  title: string;
  hint?: string;
  keys?: string;
  /** Border + title + selection colour. Defaults to the active theme accent. */
  color?: string;
  width: number;
  children: ReactNode;
}): ReactElement {
  const accent = overlayAccent(props.color);
  const inner = Math.max(8, props.width - 4); // round border (2) + paddingX (2)
  return (
    <Ctx.Provider value={{ inner, accent }}>
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1} width={props.width}>
        <Text color={accent} bold>
          {props.title}
        </Text>
        {props.hint ? <Text dimColor>{props.hint}</Text> : null}
        <Box flexDirection="column" marginTop={1}>
          {props.children}
        </Box>
        {props.keys ? <Text color="gray">{props.keys}</Text> : null}
      </Box>
    </Ctx.Provider>
  );
}

export function OverlayRow(props: {
  selected: boolean;
  mark: string;
  markColor?: string;
  label: string;
  meta?: string;
}): ReactElement {
  const { inner, accent } = useContext(Ctx);
  const tail = props.meta ? `  ${props.meta}` : "";
  if (props.selected) {
    return (
      <Text backgroundColor={accent} color="black">
        {fillRow(`› ${props.mark} ${props.label}${tail}`, inner)}
      </Text>
    );
  }
  return (
    <Text>
      <Text>{"  "}</Text>
      <Text color={props.markColor}>
        {props.mark}
        {" "}
      </Text>
      {props.label}
      {props.meta ? <Text dimColor>{tail}</Text> : null}
    </Text>
  );
}
