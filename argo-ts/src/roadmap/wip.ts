export const WIP_LIMIT = 2;

export class WipLimitError extends Error {
  readonly count: number;
  readonly limit: number;

  constructor(count: number, limit: number) {
    super(
      `WIP limit reached: ${count}/${limit} items already in Now (building). Finish or move one to shipped before adding another.`,
    );
    this.name = "WipLimitError";
    this.count = count;
    this.limit = limit;
  }
}

/**
 * Returns a WipLimitError if moving `movingId` to `toStatus` would exceed the
 * building-column WIP limit, otherwise null. Pure — no I/O.
 */
export function checkWipLimit(
  items: readonly { id: string; status: string }[],
  movingId: string,
  toStatus: string,
  limit = WIP_LIMIT,
): WipLimitError | null {
  if (toStatus !== "building") return null;
  const count = items.filter((i) => i.status === "building" && i.id !== movingId).length;
  if (count >= limit) return new WipLimitError(count, limit);
  return null;
}
