import { useNavigate } from "react-router";

import { shownInMode, $interfaceMode } from "@/store/interface-mode";
import { useStore } from "@nanostores/react";

import type { TitlebarTool } from "../titlebar-controls";

/** Icon buttons that pages and plugins register for the titlebar (the preview
 *  pane's reload and devtools, a plugin's action). They share the shell's own
 *  button look instead of the old 24px cluster. */
export function ContributedTools({
  tools,
}: {
  tools: readonly TitlebarTool[];
}) {
  const navigate = useNavigate();
  const mode = useStore($interfaceMode);
  const shown = shownInMode(mode);
  const visible = tools.filter((tool) => !tool.hidden && shown(tool));

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="vs-tb-right">
      {visible.map((tool) => (
        <button
          aria-label={tool.label}
          aria-pressed={tool.active ?? undefined}
          className="vs-icon"
          data-tour={tool.tour}
          disabled={tool.disabled}
          key={tool.id}
          onClick={(event) => {
            if (tool.to) {
              navigate(tool.to);
            }

            tool.onSelect?.(event);
          }}
          type="button"
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}
