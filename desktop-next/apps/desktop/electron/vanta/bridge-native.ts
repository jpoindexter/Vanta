import { type IpcRendererLike, subscribe } from "./bridge-core";
import { CH } from "./channels";

/** The renderer-side error for a repository change that has to go through an approval. */
export class NeedsApprovalError extends Error {
  readonly needsApproval = true;

  constructor(message: string) {
    super(message);
    this.name = "NeedsApprovalError";
  }
}

interface MutationAnswer {
  message?: string;
  needsApproval?: boolean;
}

/** Read-only project files: every path is checked in the main process against the project root. */
export function projectFileApi(ipc: IpcRendererLike) {
  return {
    gitRoot: (path: string) => ipc.invoke(CH.fsGitRoot, path),
    normalizePreviewTarget: (target: string, baseDir?: string) => ipc.invoke(CH.fsNormalizePreview, target, baseDir),
    onPreviewFileChanged: (callback: (payload: unknown) => void) => subscribe(ipc, CH.previewFileChanged, callback),
    readDir: (path: string, page?: { limit?: number; offset?: number }) => ipc.invoke(CH.fsReadDir, path, page),
    readFileDataUrl: (path: string) => ipc.invoke(CH.fsReadDataUrl, path),
    readFileText: (path: string) => ipc.invoke(CH.fsReadText, path),
    stopPreviewFileWatch: (id: string) => ipc.invoke(CH.fsStopWatch, id),
    watchDirectory: (dir: string) => ipc.invoke(CH.fsWatchDirectory, dir),
    watchPreviewFile: (url: string) => ipc.invoke(CH.fsWatchFile, url)
  };
}

/** A change to a repository: the main process answers with the reason it needs approval, and the call rejects with it. */
function mutation(ipc: IpcRendererLike, member: string) {
  return async (..._args: unknown[]): Promise<never> => {
    const answer = await ipc.invoke<MutationAnswer>(CH.gitMutation, { member });

    throw new NeedsApprovalError(answer?.message ?? "This change needs your approval in Vanta.");
  };
}

/** Read-only git for the Files, Changes and branch UI. Anything that writes is refused with a readable reason. */
export function gitApi(ipc: IpcRendererLike) {
  return {
    git: {
      baseBranchList: (repo: string) => ipc.invoke(CH.gitBaseBranchList, repo),
      branchList: (repo: string) => ipc.invoke(CH.gitBranchList, repo),
      branchSwitch: mutation(ipc, "branchSwitch"),
      fileDiff: (repo: string, file: string) => ipc.invoke(CH.gitFileDiff, repo, file),
      repoStatus: (repo: string) => ipc.invoke(CH.gitRepoStatus, repo),
      review: {
        commit: mutation(ipc, "commit"),
        createPr: mutation(ipc, "createPr"),
        diff: (...[repo, file, scope, baseRef, staged]: [string, string, string, (null | string)?, boolean?]) =>
          ipc.invoke(CH.gitReviewDiff, repo, file, { baseRef, scope, staged }),
        list: (repo: string, scope: string, baseRef?: null | string) => ipc.invoke(CH.gitReviewList, repo, scope, baseRef),
        prList: (repo: string, branches: string[], numbers?: number[]) =>
          ipc.invoke(CH.gitReviewPrList, repo, branches, numbers),
        push: mutation(ipc, "push"),
        revParse: (repo: string, ref?: null | string) => ipc.invoke(CH.gitReviewRevParse, repo, ref),
        revert: mutation(ipc, "revert"),
        shipInfo: (repo: string) => ipc.invoke(CH.gitReviewShipInfo, repo),
        stage: mutation(ipc, "stage"),
        unstage: mutation(ipc, "unstage")
      },
      scanRepos: (roots: string[], options?: unknown) => ipc.invoke(CH.gitScanRepos, roots, options),
      worktreeAdd: mutation(ipc, "worktreeAdd"),
      worktreeList: (repo: string) => ipc.invoke(CH.gitWorktreeList, repo),
      worktreeRemove: mutation(ipc, "worktreeRemove")
    }
  };
}

/** Terminal panes. They are not a shell: each line typed is one command that waits for approval in the chat. */
export function terminalApi(ipc: IpcRendererLike) {
  const onFor = <T>(channel: string) => (id: string, callback: (payload: T) => void) => {
    const listener = (_event: unknown, from: string, payload: T) => {
      if (from === id) {
        callback(payload);
      }
    };

    ipc.on(channel, listener as never);

    return () => void ipc.removeListener(channel, listener as never);
  };

  return {
    terminal: {
      attach: (id: string) => ipc.invoke<boolean>(CH.terminalAttach, id),
      cwd: (id: string) => ipc.invoke<null | string>(CH.terminalCwd, id),
      dispose: (id: string) => ipc.invoke<boolean>(CH.terminalDispose, id),
      onData: onFor<string>(CH.terminalData),
      onExit: onFor<{ code: null | number; signal: null | string }>(CH.terminalExit),
      resize: (id: string, size: { cols: number; rows: number }) => ipc.invoke<boolean>(CH.terminalResize, id, size),
      start: (options?: { cols?: number; cwd?: string; rows?: number }) => ipc.invoke(CH.terminalStart, options),
      write: (id: string, data: string) => ipc.invoke<boolean>(CH.terminalWrite, id, data)
    }
  };
}
