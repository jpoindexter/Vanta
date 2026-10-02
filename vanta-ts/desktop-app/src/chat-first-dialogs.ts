import { useEffect } from "react";

const controls = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

function focusable(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(controls)].filter((node) => node.getClientRects().length > 0);
}

/** Existing dialogs keep their behavior; the new shell owns focus containment. */
export function useChatDialogs() {
  useEffect(() => {
    let active: HTMLElement | undefined;
    let opener: HTMLElement | null = null;
    let restoreBackground = () => {};
    function synchronize() {
      const dialogs = [...document.querySelectorAll<HTMLElement>('.chat-first-shell [role="dialog"]')];
      const next = dialogs.filter((dialog) => dialog.getClientRects().length > 0).at(-1);
      if (next === active) return;
      restoreBackground();
      if (!next) { active = undefined; if (opener?.isConnected) opener.focus(); opener = null; return; }
      if (!active) opener = document.activeElement as HTMLElement;
      active = next;
      restoreBackground = isolateDialog(active);
      if (!active.contains(document.activeElement)) focusable(active)[0]?.focus();
    }
    function trap(event: KeyboardEvent) {
      if (event.key === "Escape" && active) {
        const close = active.querySelector<HTMLButtonElement>('button[aria-label^="Close" i]:not(:disabled)');
        if (close) { event.preventDefault(); event.stopImmediatePropagation(); close.click(); }
        return;
      }
      if (event.key !== "Tab" || !active) return;
      const items = focusable(active);
      const index = items.indexOf(document.activeElement as HTMLElement);
      const end = event.shiftKey ? index <= 0 : index < 0 || index === items.length - 1;
      if (!end) return;
      event.preventDefault();
      (event.shiftKey ? items.at(-1) : items[0])?.focus();
    }
    const observer = new MutationObserver(synchronize);
    observer.observe(document.getElementById("root")!, { subtree: true, childList: true });
    document.addEventListener("keydown", trap, true);
    synchronize();
    return () => { observer.disconnect(); restoreBackground(); document.removeEventListener("keydown", trap, true); };
  }, []);
}

/** Keep the visible modal reachable while excluding its background from AT and focus. */
export function isolateDialog(dialog: HTMLElement): () => void {
  const previous = new Map<HTMLElement, boolean>();
  let current: HTMLElement | null = dialog;
  while (current?.parentElement && current.id !== "root") {
    for (const sibling of current.parentElement.children) {
      if (sibling === current || !(sibling instanceof HTMLElement)) continue;
      previous.set(sibling, sibling.inert); sibling.inert = true;
    }
    current = current.parentElement;
  }
  return () => { for (const [element, inert] of previous) element.inert = inert; };
}
