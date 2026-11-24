/** What the always-on-top dot shows. */
export const DOT_STATES = ['idle', 'working', 'needs-you', 'done'] as const

export type DotState = (typeof DOT_STATES)[number]

/** What the main window reports: is any session running, and is any waiting on the person. */
export interface DotFeed {
  needsInput: boolean
  working: boolean
}

export const DOT_SIZE = 56
export const DONE_HOLD_MS = 4_000

/**
 * The state for a report. A turn that just finished shows "done" for a moment (the caller holds it), a session
 * waiting on the person always wins, and anything running is "working".
 */
export function nextDotState(feed: DotFeed, wasWorking: boolean): DotState {
  if (feed.needsInput) return 'needs-you'
  if (feed.working) return 'working'

  return wasWorking ? 'done' : 'idle'
}

const LABELS: Record<DotState, string> = {
  done: 'Vanta finished. Open Vanta.',
  idle: 'Vanta is idle. Open Vanta.',
  'needs-you': 'Vanta needs you. Open Vanta.',
  working: 'Vanta is working. Open Vanta.'
}

export const dotLabel = (state: DotState): string => LABELS[state]

/**
 * The dot's page. Static: it holds no data and talks to nothing. A click navigates to `vanta-dot://click`, which the
 * window adapter turns into "open Vanta"; the outer ring is the drag handle.
 */
export function dotHtml(initial: DotState): string {
  return `<!doctype html><meta charset="utf-8"><title>Vanta</title>
<style>
  :root { color-scheme: light dark; --ink:#202024; --paper:#ececee; --need:#c2410c; --ok:#15803d; }
  html,body { margin:0; height:100%; background:transparent; overflow:hidden; -webkit-user-select:none; user-select:none; }
  #ring { box-sizing:border-box; width:${DOT_SIZE}px; height:${DOT_SIZE}px; padding:10px; border-radius:50%; -webkit-app-region:drag; }
  button { -webkit-app-region:no-drag; box-sizing:border-box; display:grid; place-items:center; width:36px; height:36px; padding:0;
    border:2px solid var(--paper); border-radius:50%; background:var(--ink); color:var(--paper); font:600 14px system-ui; cursor:pointer;
    box-shadow:0 1px 4px rgba(0,0,0,.35); }
  button:focus-visible { outline:2px solid #3a83f7; outline-offset:2px; }
  body[data-state=working] button { border-color:transparent; background:conic-gradient(var(--paper), var(--ink) 70%); animation:spin 1.1s linear infinite; }
  body[data-state=working] button span { animation:spin 1.1s linear infinite reverse; }
  body[data-state=needs-you] button { background:var(--need); border-color:#fff; }
  body[data-state=done] button { background:var(--ok); border-color:#fff; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { body[data-state=working] button, body[data-state=working] button span { animation:none; } }
</style>
<body data-state="${initial}"><div id="ring"><button id="dot" type="button" aria-label="${dotLabel(initial)}" title="${dotLabel(initial)}"><span>V</span></button></div>
<script>
  const labels = ${JSON.stringify(LABELS)};
  window.__setState = (state) => {
    document.body.dataset.state = state;
    const button = document.getElementById('dot');
    button.setAttribute('aria-label', labels[state]);
    button.title = labels[state];
  };
  document.getElementById('dot').addEventListener('click', () => { location.href = 'vanta-dot://click'; });
</script>`
}
