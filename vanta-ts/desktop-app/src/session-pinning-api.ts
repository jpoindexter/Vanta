import { api } from "./api.js";

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function sessionPinningHandlers(refresh: () => Promise<unknown>) {
  return {
    async pinSession(id: string, pinned: boolean) {
      await api("/api/sessions/pin", postJson({ id, pinned }));
      await refresh();
    },
    async reorderPinnedSessions(orderedIds: string[]) {
      await api("/api/sessions/reorder-pins", postJson({ orderedIds }));
      await refresh();
    },
  };
}
