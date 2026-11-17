const labels = { connecting: "Connecting", ready: "Ready", working: "Working", "needs-you": "Needs you" };
function showPhase(phase) {
  document.getElementById("phase").textContent = labels[phase] ?? "Connecting";
  document.body.dataset.phase = Object.hasOwn(labels, phase) ? phase : "connecting";
}
function failed() { document.getElementById("phase").textContent = "Open Vanta to retry"; }
document.getElementById("open").addEventListener("click", () => { void window.vantaAvatar.open().catch(failed); });
document.getElementById("hide").addEventListener("click", () => { void window.vantaAvatar.hide().catch(failed); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") void window.vantaAvatar.hide().catch(failed); });
window.vantaAvatar.onPhase(showPhase);
void window.vantaAvatar.readPhase().then(showPhase).catch(failed);
