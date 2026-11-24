import { useAuiState, useThreadRuntime } from "@assistant-ui/react";
import type { FC } from "react";

import { requestComposerSubmit } from "@/app/chat/composer/focus";
import { useComposerScope } from "@/app/chat/composer/scope";
import { triggerHaptic } from "@/lib/haptics";
import { setToolDisclosureOpen } from "@/store/tool-view";

import { toolCallFailed, toolEntryDisclosureId } from "./fallback-model";
import { Button } from "@/components/ui/button";

/** Stop sits on the live line so the run can be halted where it is being watched. */
export const StopStepButton: FC = () => {
  const thread = useThreadRuntime();

  return (
    <Button
      className="ml-auto" size="xs"
      variant="ghost"
      data-vp="running-stop"
      onClick={() => {
        triggerHaptic("cancel");
        thread.cancelRun();
      }}
      type="button"
    >
      Stop
    </Button>
  );
};

/** A failed step keeps its own Retry: it asks the agent to run that step again. */
export const RetryStepButton: FC<{ title: string }> = ({ title }) => {
  const scope = useComposerScope();

  return (
    <Button
      className="ml-auto" size="xs"
      variant="ghost"
      onClick={() => {
        triggerHaptic("submit");
        requestComposerSubmit(`Retry the step that failed: ${title}`, {
          target: scope.target,
        });
      }}
      type="button"
    >
      Retry
    </Button>
  );
};

/** Opens the output of the last failed step in place; the step row stays where it was. */
export const ViewOutputButton: FC = () => {
  const target = useAuiState((state) => {
    const failed = state.message.parts.findLast(
      (part) => part.type === "tool-call" && toolCallFailed(part),
    );

    return failed?.type === "tool-call"
      ? toolEntryDisclosureId(state.message.id, failed)
      : "";
  });

  if (!target) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setToolDisclosureOpen(target, true);
        document
          .querySelector(
            `[data-tool-row][data-disclosure-id="${CSS.escape(target)}"]`,
          )
          ?.scrollIntoView({ block: "nearest" });
      }}
      type="button"
    >
      View output
    </Button>
  );
};
