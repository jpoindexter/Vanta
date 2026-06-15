import { createElement as h, useEffect, useState, type ReactElement } from "react";
import { Box, Static, render } from "ink";
import { Banner } from "../src/ui/banner.js";
import { Composer } from "../src/ui/composer.js";
import { TodoPanel } from "../src/ui/todo-panel.js";
import { Footer } from "../src/ui/app.js";
import { ThemeProvider } from "../src/ui/theme.js";
import { resolveTheme } from "../src/term/theme.js";
import { installResizeGhostFix } from "../src/term/resize-fix.js";
import { EntryView } from "../src/ui/transcript.js";
import { PinnedRegion, resolveComposerAnchor } from "../src/ui/pinned-region.js";
import { useViewportRows } from "../src/ui/use-viewport-rows.js";
import { estimateCommittedRows } from "../src/ui/layout-rows.js";
import type { Entry } from "../src/ui/types.js";

// Dev harness for scripts/ghost-storm.sh + ghost-tall.sh. Mirrors app.tsx's idle
// render tree (Static banner + PinnedRegion{ live + composer + footer }) using the
// REAL components + real bottom-pin logic, so the tmux scripts exercise the actual
// render path. Uses createElement (not JSX) so it runs via tsx from scripts/.

const GOAL = "Analyze Vanta roadmap, choose the best next build item(s), and produce a Codex-ready implementation plan";
const ENTRIES = Number(process.env.ENTRIES ?? 0);

/** Fake committed transcript for testing the estimator-driven bottom-pin. */
function fakeEntries(n: number): Entry[] {
  const out: Entry[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ kind: "user", text: `question number ${i + 1} about the codebase` });
    out.push({ kind: "assistant", text: `Answer ${i + 1}: here is a short reply line.` });
  }
  return out;
}

function Repro(): ReactElement {
  const theme = resolveTheme(process.env);
  const vp = useViewportRows();
  const [goal, setGoal] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setGoal(GOAL), 80); return () => clearTimeout(id); }, []);
  const entries = fakeEntries(ENTRIES);
  const staticItems = [
    { key: "banner", node: h(Banner, { model: "gpt-5.5", cwd: "~/dev/Vanta", kernel: "127.0.0.1:7788", tools: 81, cmds: 95 }) },
    ...entries.map((e, i) => ({ key: `e${i}`, node: h(EntryView, { entry: e }) })),
  ];
  const committedRows = estimateCommittedRows(entries, vp.cols);
  return h(ThemeProvider, { theme }, h(Box, { flexDirection: "column" },
    h(Static, { items: staticItems }, (item: { key: string; node: ReactElement }) => h(Box, { key: item.key }, item.node)),
    h(PinnedRegion, { enabled: resolveComposerAnchor(process.env) === "bottom", viewportRows: vp.rows, committedRows },
      h(TodoPanel, { todos: [] }),
      h(Box, { flexDirection: "column" },
        h(Composer, { focused: true, onSubmit: () => {}, placeholder: "Ask Vanta anything — /help for commands", files: [], history: [] })),
      h(Footer, { model: "gpt-5.5", effortLevel: "medium", ctxPct: 0, tokens: 12000, contextWindow: 272000, turns: 0, busy: false, queued: 0, goal, mcp: false, elapsed: "0s" }),
    ),
  ));
}

render(h(Repro));
void installResizeGhostFix(process.stdout);
