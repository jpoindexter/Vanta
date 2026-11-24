"use strict";
// Local review interactions only: no agent, storage, microphone, files or network.
const byId = (id) => document.getElementById(id);
const shell = document.querySelector(".window");
const dialog = byId("dialog");
let dialogTrigger;
const titles = { home: "New chat", conversation: "Research a decision", today: "Today", inbox: "Inbox", project: "My business" };
const notes = {
  activity: ["Activity", "<p>Sample activity is disclosed inline instead of becoming the primary interface. Real runs must retain their observed status, exact action previews, outputs, evidence, Stop and recovery controls.</p><p class='muted'>Nothing is running in this proposal.</p>"],
  attachment: ["Add to this conversation", "<p>Files, images and other context belong to the same composer. This preview opens no file picker and uploads nothing.</p>"],
  access: ["Ask first", "<p>A quieter interface is not broader authority. Real permission controls must retain their existing scope, action previews and revocation. This preview changes no permissions.</p>"],
  model: ["Model", "<p>The existing selected model and provider setup stay intact. One shared menu treatment replaces inconsistent control styles; this preview does not select or contact a model.</p>"],
  voice: ["Voice", "<p>Voice belongs beside typing, with clear listening, processing and playback states. No microphone is accessed or audio recorded here.</p>"],
  document: ["Decision brief.md", "<p class='muted'>Sample document · not an actual file</p><h2>Recommendation</h2><p>Start with the workflow you use every day. Keep the recommendation, supporting evidence and next step together.</p><h2>Next step</h2><p>Review the options alongside this conversation. Production document access and editing remain separate acceptance paths.</p>"],
  settings: ["Settings", "<div class='setting-row'><span>Appearance<small>Shared across every surface</small></span><button class='quiet' type='button' id='settings-appearance'>Switch light / dark</button></div><div class='setting-row'><span>Models and connections<small>Existing setup remains available</small></span><span class='muted'>Preview only</span></div><div class='setting-row'><span>Permissions<small>Visible, scoped and revocable</small></span><span class='muted'>Unchanged</span></div><p class='muted'>One layout and control language, not a separate settings app. No preferences are persisted by this proposal.</p>"],
  design: ["One Vanta design system", "<dl><div><dt>One visual foundation</dt><dd>Vanta white/grey, system type, 14/20 UI text and a 4px spacing base. Colour is reserved for focus, links and meaningful state.</dd></div><div><dt>Shared depth</dt><dd>Quiet resting controls; layered composer, sidebar/canvas and window shadows. Menus and dialogs use the same surface and focus language.</dd></div><div><dt>Same conversation everywhere</dt><dd>New chat has no work-contract form. Projects add context. Activity, documents and evidence open alongside the conversation.</dd></div><div><dt>Approved composer, proposed wider shell</dt><dd>22px composer radius, 12px inset, 32px controls and a 720px column are carried from the approved proposal. Sidebar, utility pages, panels and dialogs are review proposals, not installed changes.</dd></div><div><dt>Implementation boundary</dt><dd>Reuse the existing Vanta theme and house components. Astryx is not installed here; mixed overlay dismissal is unresolved. This static proposal does not prove production keyboard or data continuity.</dd></div></dl>"],
};
function showView(view, trigger) {
  if (!titles[view]) return;
  byId("content").replaceChildren(byId(view).content.cloneNode(true));
  byId("window-title").textContent = titles[view];
  byId("canvas").classList.toggle("home", view === "home");
  document.querySelectorAll(".sidebar [data-view]").forEach((node) => {
    const active = trigger === node;
    node.classList.toggle("current", active);
    if (active) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current");
  });
  byId("content").scrollTop = 0;
  if (shell.classList.contains("sidebar-open")) {
    shell.classList.remove("sidebar-open");
    byId("sidebar-toggle").setAttribute("aria-expanded", "false");
    byId("content").focus();
  }
}
function openNote(name, trigger) {
  if (!notes[name]) return;
  dialogTrigger = trigger;
  byId("dialog-title").textContent = notes[name][0];
  byId("dialog-content").innerHTML = notes[name][1]; // Authored constants only; never user text.
  dialog.showModal();
}
function toggleAppearance() {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  byId("appearance").textContent = dark ? "Light preview" : "Dark preview";
  byId("appearance").setAttribute("aria-pressed", String(dark));
}
function setPanel(open) {
  byId("work-panel").hidden = !open;
  byId("workbench").setAttribute("aria-expanded", String(open));
}
document.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]");
  const note = event.target.closest("[data-open]");
  if (view) showView(view.dataset.view, view);
  if (note) openNote(note.dataset.open, note);
  if (event.target.closest("#settings-appearance")) toggleAppearance();
});
byId("appearance").addEventListener("click", toggleAppearance);
byId("design").addEventListener("click", (event) => openNote("design", event.currentTarget));
byId("dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => dialogTrigger?.focus());
byId("workbench").addEventListener("click", () => setPanel(byId("work-panel").hidden));
byId("panel-close").addEventListener("click", () => { setPanel(false); byId("workbench").focus(); });
byId("sidebar-toggle").addEventListener("click", () => {
  const visible = getComputedStyle(document.querySelector(".sidebar")).display !== "none";
  shell.classList.toggle("sidebar-hidden", visible);
  shell.classList.toggle("sidebar-open", !visible);
  byId("sidebar-toggle").setAttribute("aria-expanded", String(!visible));
});
byId("search").addEventListener("click", () => { byId("chat-search").hidden = false; byId("chat-search").focus(); });
byId("chat-search").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  document.querySelectorAll(".sidebar [data-view]:not([data-view='home'])").forEach((node) => { node.hidden = !node.textContent.toLowerCase().includes(query); });
});
byId("draft").addEventListener("input", () => { byId("send").disabled = !byId("draft").value.trim(); });
function previewSend() {
  if (!byId("send").disabled) byId("preview-status").textContent = "Send preview only · nothing was sent · your text is unchanged";
}
byId("send").addEventListener("click", previewSend);
byId("draft").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); previewSend(); }
});
showView("conversation", document.querySelector(".sidebar .current"));
