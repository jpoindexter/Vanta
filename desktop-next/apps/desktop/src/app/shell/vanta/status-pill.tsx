import {
  IconAlertTriangleFilled,
  IconCheck,
  IconCircle,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";

import { useI18n } from "@/i18n";

import type { PillStatus } from "./titlebar-status";

const ICON_SIZE = 12;

function PillIcon({ status }: { status: PillStatus }) {
  switch (status) {
    case "running":
      return (
        <IconLoader2
          aria-hidden
          className="vs-glyph-running"
          size={ICON_SIZE}
        />
      );

    case "waiting":
    case "needs-input":
      return <IconAlertTriangleFilled aria-hidden size={ICON_SIZE} />;

    case "offline":
      return <IconCircle aria-hidden size={ICON_SIZE} />;

    case "done":
      return <IconCheck aria-hidden size={ICON_SIZE} />;

    default:
      return <IconX aria-hidden size={ICON_SIZE} />;
  }
}

const WORD_KEY = {
  done: "done",
  failed: "failed",
  "needs-input": "needsInput",
  offline: "offline",
  running: "running",
  waiting: "waiting",
} as const;

/** The titlebar's single status pill: a shape and a word, never colour alone. */
export function StatusPill({
  elapsed,
  status,
}: {
  elapsed?: string;
  status: PillStatus;
}) {
  const { t } = useI18n();
  const word = t.vantaShell.status[WORD_KEY[status]];

  return (
    <span className="vs-pill" data-status={status} role="status">
      <PillIcon status={status} />
      <span>{word}</span>
      {elapsed ? <span aria-hidden>{elapsed}</span> : null}
    </span>
  );
}
