// Parity spec: one row per wireframe element named in the chat annotations (5 to 10).
// `wf` selects the element in the wireframe (state-driven JS), `built` selects the same
// element in the fixtures harness (data-vp hooks). `states` lists where the row applies.
// `props` are measured on both sides and compared; text is compared verbatim except for
// the documented icon swaps (Tabler instead of text glyphs), which are stripped first.

export const GEOMETRY = ["width", "height"];
export const BOX = ["borderRadius", "borderWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
export const TYPE = ["fontSize", "fontWeight", "lineHeight"];

const ALL = ["empty", "running", "waiting", "blocked", "done", "failed", "offline"];
const THREAD = ["running", "waiting", "done", "failed", "offline"];

export const ELEMENTS = [
  // 5 thread column
  { id: "thread.column", note: 5, wf: ".scroll > .col", built: '[data-vp="column"]', states: ALL.filter((s) => s !== "empty"), props: ["width", "centeredOffset"] },
  { id: "thread.userBubble", note: 5, wf: ".msg-u", built: '[data-vp="user-bubble"]', states: THREAD, props: ["borderRadius", "paddingTop", "paddingLeft", "fontSize", "lineHeight", "text", "alignRight", "maxWidthPct"] },
  { id: "thread.userActions", note: 5, wf: ".hov:has(.msg-u) .hover-actions", built: '[data-vp="user-actions"]', states: THREAD, props: ["text", "hiddenAtRest", "shownOnHover", "height"] },
  { id: "thread.assistantText", note: 5, wf: ".msg-a > div:first-child", built: '[data-slot="aui_assistant-message-content"] .aui-md', states: THREAD, props: ["fontSize", "lineHeight", "text", "noBackground"], first: true },
  { id: "thread.assistantActions", note: 5, wf: ".msg-a .hover-actions", built: '[data-vp="assistant-actions"]', states: THREAD, props: ["text", "hiddenAtRest", "shownOnHover"], first: true },
  // 6 collapsed tool step
  { id: "step.collapsed", note: 6, wf: ".step[data-step]", built: '[data-vp="step"]', states: ["waiting", "running", "failed", "done", "offline", "blocked"], props: ["text", "height", "fontSize", "ariaExpanded"], first: true },
  // 7 diff card
  { id: "diff.card", note: 7, wf: ".card:has(.diff)", built: '[data-vp="diff-card"]', states: THREAD, props: ["borderRadius", "borderWidth", "paddingTop", "paddingLeft", "height", "width", "text"] },
  { id: "diff.reviewButton", note: 7, wf: ".card:has(.diff) button", built: '[data-vp="diff-review"]', states: THREAD, props: ["text", "height", "borderRadius"] },
  // 8 approval + blocked + failed cards
  { id: "approval.card", note: 8, wf: '.card[role="alert"]', built: '[data-vp="approval-card"]', states: ["waiting"], props: ["borderRadius", "borderWidth", "paddingTop", "paddingLeft", "width", "height"] },
  { id: "approval.title", note: 8, wf: '.card[role="alert"] h4', built: '[data-vp="approval-title"]', states: ["waiting"], props: ["text", "fontSize"] },
  { id: "approval.sub", note: 8, wf: '.card[role="alert"] .sub', built: '[data-vp="approval-sub"]', states: ["waiting"], props: ["text", "fontSize"] },
  { id: "approval.code", note: 8, wf: '.card[role="alert"] .code', built: '[data-vp="approval-code"]', states: ["waiting"], props: ["text", "fontSize", "borderRadius", "paddingTop", "paddingLeft"] },
  { id: "approval.actions", note: 8, wf: '.card[role="alert"] .acts', built: '[data-vp="approval-actions"]', states: ["waiting"], props: ["buttonTexts", "buttonHeight", "gap"] },
  { id: "approval.note", note: 8, wf: '.card[role="alert"] .note', built: '[data-vp="approval-note"]', states: ["waiting"], props: ["text", "fontSize"] },
  { id: "blocked.card", note: 8, wf: '.card[role="alert"]', built: '[data-vp="blocked-card"]', states: ["blocked"], props: ["borderRadius", "paddingTop", "width", "height", "text"] },
  { id: "blocked.actions", note: 8, wf: '.card[role="alert"] .acts', built: '[data-vp="blocked-actions"]', states: ["blocked"], props: ["buttonTexts", "buttonHeight", "gap"] },
  { id: "failed.card", note: 8, wf: '.card[role="alert"]', built: '[data-vp="failure-card"]', states: ["failed"], props: ["borderRadius", "paddingTop", "width", "height", "text"] },
  { id: "failed.actions", note: 8, wf: '.card[role="alert"] .acts', built: '[data-vp="failure-actions"]', states: ["failed"], props: ["buttonTexts", "buttonHeight", "gap"] },
  { id: "running.line", note: 6, wf: ".step[aria-live]", built: '[data-vp="running-line"]', states: ["running"], props: ["text", "height", "fontSize"] },
  { id: "running.stop", note: 9, wf: ".step[aria-live] button", built: '[data-vp="running-stop"]', states: ["running"], props: ["text", "height", "borderRadius"] },
  // 9 composer + queue
  { id: "composer.shell", note: 9, wf: ".composer", built: '[data-vp="composer"]', states: ALL, props: ["borderRadius", "borderWidth", "paddingTop", "paddingLeft", "width", "height"] },
  { id: "composer.textarea", note: 9, wf: ".composer textarea", built: '[data-vp="composer-input"]', states: ALL, props: ["height", "fontSize", "placeholder"] },
  { id: "composer.attach", note: 9, wf: ".composer .tools > .icon:nth-child(1)", built: '[data-vp="composer-left"] > button', states: ALL, props: ["width", "height", "ariaLabel"] },
  { id: "composer.dictate", note: 9, wf: ".composer .tools > .icon:nth-child(2)", built: '[data-vp="composer-left"] [data-slot="fan-menu-anchor"] > button', states: ALL, props: ["width", "height", "ariaLabel"] },
  { id: "composer.send", note: 9, wf: ".composer .send", built: '[data-vp="composer-send"]', states: ALL, props: ["width", "height", "borderRadius", "ariaLabel"] },
  { id: "composer.hint", note: 9, wf: ".hint", built: '[data-vp="composer-hint"]', states: ALL, props: ["text", "fontSize", "textAlign"] },
  { id: "composer.dock", note: 9, wf: ".dock .col", built: '[data-vp="composer"]', states: ALL, props: ["width", "centeredOffset"] },
  // 10 chips
  { id: "chips.model", note: 10, wf: ".composer .rel .chip:nth-of-type(1)", built: '[data-vp="chip-model"]', states: ALL, props: ["text", "height", "borderRadius", "fontSize"] },
  { id: "chips.effort", note: 10, wf: ".composer .rel .chip:nth-of-type(2)", built: '[data-vp="chip-effort"]', states: ALL, props: ["text", "height", "borderRadius", "fontSize"] },
  { id: "chips.permission", note: 10, wf: ".composer .rel .chip:nth-of-type(3)", built: '[data-vp="chip-permission"]', states: ALL, props: ["text", "height", "borderRadius", "fontSize"] },
  // empty state
  { id: "empty.heading", note: 5, wf: ".empty h3", built: '[data-vp="empty-heading"]', states: ["empty"], props: ["text", "fontSize", "fontWeight", "textAlign"] },
  { id: "empty.copy", note: 5, wf: ".empty > p", built: '[data-vp="empty-copy"]', states: ["empty"], props: ["text", "fontSize", "textAlign"] },
  { id: "empty.chips", note: 5, wf: ".empty .chips", built: '[data-vp="empty-chips"]', states: ["empty"], props: ["buttonTexts", "buttonHeight", "gap", "width"] },
  { id: "empty.column", note: 5, wf: ".empty", built: '[data-vp="empty"]', states: ["empty"], props: ["width", "centeredOffset"] },
];

// Interactive scenarios: wireframe behaviour reproduced in the harness.
export const SCENARIOS = [
  { id: "queue.row", note: 9, wf: ".queue", built: '[data-vp="queue-row"]', props: ["text", "height", "borderRadius", "paddingTop", "paddingLeft", "fontSize"] },
  { id: "queue.remove", note: 9, wf: ".queue button", built: '[data-vp="queue-remove"]', props: ["text", "height"] },
  { id: "composer.hint.running", note: 9, wf: ".hint", built: '[data-vp="composer-hint"]', props: ["text"] },
  { id: "composer.stop", note: 9, wf: ".composer .send", built: '[data-vp="composer-send"]', props: ["ariaLabel", "width", "height"] },
];
