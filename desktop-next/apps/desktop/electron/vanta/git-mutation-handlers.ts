import { CH } from "./channels";
import type { GitContext } from "./git-common";
import { failureReason, type GatedRunner } from "./gated-run";
import { mutationRequest, planMutation } from "./git-mutations";
import type { IpcLike } from "./native-handlers";

export const NO_CHAT_MESSAGE = "Open a chat first: the approval card for this change appears there.";

export interface MutationDeps extends GitContext {
  /** The chat whose event stream will show the approval card for this window. */
  clientFor: (sender: unknown) => string | undefined;
  ipc: IpcLike;
  run: GatedRunner;
}

export type MutationAnswer = { message: string; ok: false } | { ok: true; result?: unknown };

/**
 * Stage, unstage, revert, commit, push and branch switch. The renderer names the change; main works out the
 * exact commands and sends each through the server's approval flow. A change that is not approved does not happen.
 */
export function registerGitMutations(deps: MutationDeps): void {
  deps.ipc.handle(CH.gitMutate, async (event, raw: unknown): Promise<MutationAnswer> => {
    const request = mutationRequest.safeParse(raw);

    if (!request.success) {
      return { message: "That change was not understood.", ok: false };
    }

    const clientId = deps.clientFor(event.sender);

    if (!clientId) {
      return { message: NO_CHAT_MESSAGE, ok: false };
    }

    const plan = await planMutation(deps, request.data);

    if (plan.ok === false) {
      return { message: plan.message, ok: false };
    }

    for (const command of plan.commands) {
      const outcome = await deps.run(command, clientId);

      if (!outcome.ok) {
        return { message: failureReason(outcome.output), ok: false };
      }
    }

    return plan.result === undefined ? { ok: true } : { ok: true, result: plan.result };
  });
}
