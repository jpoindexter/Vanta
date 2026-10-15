type RefreshTarget<T> = {
  version: { current: number };
  readStatus: () => Promise<T>;
  accept: (status: T) => void;
  reject: (message: string) => void;
  refreshInventory: () => Promise<void>;
};

// Session selection already waits for canonical history and the saved draft.
// Its last blocking read is current model/permission authority, not the complete
// artifact, integration and session inventories refreshed by other workspaces.
export async function refreshActiveConversation<T>(target: RefreshTarget<T>): Promise<void> {
  const version = ++target.version.current;
  try {
    const status = await target.readStatus();
    if (version !== target.version.current) throw new Error("Workspace changed while refreshing this chat. Retry the selection.");
    target.accept(status);
  } catch (reason) {
    if (version === target.version.current) target.reject(errorMessage(reason));
    throw reason;
  }
  const background = target.refreshInventory();
  const backgroundVersion = target.version.current;
  void background.catch((reason) => {
    if (backgroundVersion === target.version.current) target.reject(errorMessage(reason));
  });
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
