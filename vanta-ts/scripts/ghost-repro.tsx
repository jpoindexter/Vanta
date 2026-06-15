import { createElement as h, useEffect, useState, type ReactElement } from "react";
import { Box, Static, render } from "ink";
import { Banner } from "../src/ui/banner.js";
import { Composer } from "../src/ui/composer.js";
import { TodoPanel } from "../src/ui/todo-panel.js";
import { Footer } from "../src/ui/app.js";
import { ThemeProvider } from "../src/ui/theme.js";
import { resolveTheme } from "../src/term/theme.js";
import { installResizeGhostFix } from "../src/term/resize-fix.js";

// Dev harness for scripts/ghost-storm.sh. Mirrors app.tsx's idle render tree
// (Static banner + null LiveRegion + null TodoPanel + Composer + Footer) using
// the REAL components, so a tmux resize storm exercises the inline-render
// ghosting path in isolation from the agent/kernel. Uses createElement (not JSX)
// so it runs via tsx from scripts/ regardless of tsconfig jsx coverage.

const GOAL = "Analyze Vanta roadmap, choose the best next build item(s), and produce a Codex-ready implementation plan";

function Repro(): ReactElement {
  const theme = resolveTheme(process.env);
  const [goal, setGoal] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setGoal(GOAL), 80); return () => clearTimeout(id); }, []);
  const staticItems = [{ key: "banner", node: h(Banner, { model: "gpt-5.5", cwd: "~/dev/Vanta", kernel: "127.0.0.1:7788", tools: 81, cmds: 95 }) }];
  return h(ThemeProvider, { theme }, h(Box, { flexDirection: "column" },
    h(Static, { items: staticItems }, (item: { key: string; node: ReactElement }) => h(Box, { key: item.key }, item.node)),
    h(TodoPanel, { todos: [] }),
    h(Box, { flexDirection: "column" },
      h(Composer, { focused: true, onSubmit: () => {}, placeholder: "Ask Vanta anything — /help for commands", files: [], history: [] })),
    h(Footer, { model: "gpt-5.5", effortLevel: "medium", ctxPct: 0, tokens: 12000, contextWindow: 272000, turns: 0, busy: false, queued: 0, goal, mcp: false, elapsed: "0s" }),
  ));
}

render(h(Repro));
void installResizeGhostFix(process.stdout);
