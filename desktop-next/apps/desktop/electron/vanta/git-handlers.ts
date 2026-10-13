import { z } from "zod";

import { CH } from "./channels";
import { baseBranchList, branchList, scanRepos, worktreeList } from "./git-branches";
import type { GitContext } from "./git-common";
import { fileDiff, reviewDiff, revParse } from "./git-diff";
import { repoStatus, reviewList } from "./git-read";
import type { IpcLike } from "./native-handlers";

export const NEEDS_APPROVAL_MESSAGE =
  "Changing a repository needs your approval. Ask Vanta in chat to do it and approve the card it shows.";

const mutationSchema = z.object({ member: z.string().min(1).max(64) });

export interface GitDeps extends GitContext {
  ipc: IpcLike;
}

/** What the PR badge shows when there is no `gh` integration: nothing, not an error. */
const NO_PULL_REQUESTS = { ghReady: false, prs: [] as never[] };
const NO_SHIP_INFO = { ghReady: false, pr: null };

function registerReadHandlers(deps: GitDeps): void {
  const { ipc } = deps;

  ipc.handle(CH.gitRepoStatus, (_event, repo: unknown) => repoStatus(deps, repo));
  ipc.handle(CH.gitFileDiff, (_event, repo: unknown, file: unknown) => fileDiff(deps, repo, file));
  ipc.handle(CH.gitBranchList, (_event, repo: unknown) => branchList(deps, repo));
  ipc.handle(CH.gitBaseBranchList, (_event, repo: unknown) => baseBranchList(deps, repo));
  ipc.handle(CH.gitWorktreeList, (_event, repo: unknown) => worktreeList(deps, repo));
  ipc.handle(CH.gitScanRepos, () => scanRepos(deps));
  ipc.handle(CH.gitReviewList, (_event, repo: unknown, scope: unknown, base: unknown) => reviewList(deps, repo, scope, base));

  ipc.handle(CH.gitReviewDiff, (_event, repo: unknown, file: unknown, options: unknown) =>
    reviewDiff(deps, repo, file, (options && typeof options === "object" ? options : {}) as Record<string, unknown>)
  );

  ipc.handle(CH.gitReviewRevParse, (_event, repo: unknown, ref: unknown) => revParse(deps, repo, ref));
  ipc.handle(CH.gitReviewShipInfo, () => NO_SHIP_INFO);
  ipc.handle(CH.gitReviewPrList, () => NO_PULL_REQUESTS);
}

/**
 * Stage, unstage, revert, commit, push, branch switch, worktree add/remove and PR creation change a
 * repository, so they never run from a renderer click. Each answers with the same readable refusal.
 */
function registerMutationRefusal({ ipc }: GitDeps): void {
  ipc.handle(CH.gitMutation, (_event, payload: unknown) => {
    const named = mutationSchema.safeParse(payload);

    return { member: named.success ? named.data.member : "unknown", message: NEEDS_APPROVAL_MESSAGE, needsApproval: true, ok: false };
  });
}

export function registerGitHandlers(deps: GitDeps): void {
  registerReadHandlers(deps);
  registerMutationRefusal(deps);
}
