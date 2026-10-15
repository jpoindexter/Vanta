export type GlobalShortcutActions = {
  focusComposer: () => void;
  openPalette: () => void;
  openNewTask: () => void;
  openReview: () => void;
  cycleAccessMode: () => void;
  openShortcuts: () => void;
  closeOverlays: () => void;
};

export function focusDesktopComposer(documentRef: Document = document): void {
  const composer = documentRef.querySelector<HTMLTextAreaElement>("#vanta-composer");
  if (!composer || composer.disabled) return;
  composer.focus();
  const cursor = composer.value.length;
  composer.setSelectionRange(cursor, cursor);
}

export function handleGlobalShortcut(event: KeyboardEvent, actions: GlobalShortcutActions): boolean {
  const action = commandShortcut(event, actions) ?? plainShortcut(event, actions);

  if (!action) return false;
  event.preventDefault();
  action();
  return true;
}

function commandShortcut(event: KeyboardEvent, actions: GlobalShortcutActions): (() => void) | undefined {
  if (!event.metaKey && !event.ctrlKey) return undefined;
  const key = `${event.shiftKey ? "shift+" : ""}${event.key.toLowerCase()}`;
  const shortcuts: Record<string, () => void> = {
    l: actions.focusComposer,
    k: actions.openPalette,
    n: actions.openNewTask,
    "shift+r": actions.openReview,
    "shift+m": actions.cycleAccessMode,
  };
  return shortcuts[key];
}

function plainShortcut(event: KeyboardEvent, actions: GlobalShortcutActions): (() => void) | undefined {
  if (event.key === "Escape") return actions.closeOverlays;
  if (event.key === "?" && !isTypingTarget(event.target)) return actions.openShortcuts;
  return undefined;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable === true;
}
