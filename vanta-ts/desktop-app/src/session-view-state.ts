export type SessionViewState = {
  scrollTop: number;
  stickToBottom: boolean;
  anchorIndex?: number;
  anchorOffset?: number;
};

export type SessionViewStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "vanta.desktop.sessionViewState.v1";
const MAX_SESSION_VIEWS = 100;

function decode(raw: string | null): Map<string, SessionViewState> {
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    const valid = parsed.flatMap((entry): Array<[string, SessionViewState]> => {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || !entry[0]) return [];
      const value = entry[1] as Partial<SessionViewState> | null;
      if (!value || typeof value.scrollTop !== "number" || !Number.isFinite(value.scrollTop) || typeof value.stickToBottom !== "boolean") return [];
      const anchorIndex = typeof value.anchorIndex === "number" && Number.isInteger(value.anchorIndex) && value.anchorIndex >= 0 ? value.anchorIndex : undefined;
      const anchorOffset = typeof value.anchorOffset === "number" && Number.isFinite(value.anchorOffset) ? value.anchorOffset : undefined;
      return [[entry[0], { scrollTop: Math.max(0, value.scrollTop), stickToBottom: value.stickToBottom, ...(anchorIndex === undefined ? {} : { anchorIndex }), ...(anchorOffset === undefined ? {} : { anchorOffset }) }]];
    });
    return new Map(valid.slice(-MAX_SESSION_VIEWS));
  } catch {
    return new Map();
  }
}

function write(storage: SessionViewStorage, views: Map<string, SessionViewState>) {
  storage.setItem(STORAGE_KEY, JSON.stringify([...views.entries()].slice(-MAX_SESSION_VIEWS)));
}

export function readSessionView(storage: SessionViewStorage, sessionId: string): SessionViewState | null {
  return decode(storage.getItem(STORAGE_KEY)).get(sessionId) ?? null;
}

export function patchSessionView(storage: SessionViewStorage, sessionId: string, patch: Partial<SessionViewState>): SessionViewState {
  const views = decode(storage.getItem(STORAGE_KEY));
  const current = views.get(sessionId) ?? { scrollTop: 0, stickToBottom: true };
  const next = {
    scrollTop: Math.max(0, Number.isFinite(patch.scrollTop) ? patch.scrollTop! : current.scrollTop),
    stickToBottom: patch.stickToBottom ?? current.stickToBottom,
    ...(patch.anchorIndex === undefined && current.anchorIndex === undefined ? {} : { anchorIndex: patch.anchorIndex ?? current.anchorIndex }),
    ...(patch.anchorOffset === undefined && current.anchorOffset === undefined ? {} : { anchorOffset: patch.anchorOffset ?? current.anchorOffset }),
  };
  views.delete(sessionId);
  views.set(sessionId, next);
  write(storage, views);
  return next;
}
