// Rows that differ from the wireframe on purpose. Anything not listed here and not passing is a FAIL.
export const KNOWN_DEVIATIONS = {
  "thread.userBubble.alignRight":
    "wireframe nests max-width 80% twice (message and bubble), so its bubble stops short of the column edge while its actions touch it; built keeps the bubble flush right at most 80% of the column",
  "queue.row.text": "the brief asks for Edit and Steer on a queued message; the wireframe draws Remove only",
};
