/** Changes presentation only: the window, renderer and conversation stay alive. */
export function createDesktopSurface({ getWindow, screen, onMode }) {
  let mode = "full";
  let saved;
  let transition = Promise.resolve();
  async function change(next) {
    if (next !== "full" && next !== "mini") throw new Error("Invalid desktop mode");
    const window = getWindow();
    if (!window || window.isDestroyed()) return mode;
    if (window.isMinimized()) window.restore();
    if (next !== mode) {
      if (next === "mini") {
        saved = snapshot(window);
        await leaveFullscreen(window);
        if (window.isMaximized()) window.unmaximize();
        const area = screen.getDisplayMatching(saved.bounds).workArea;
        window.setMinimumSize(360, 480);
        window.setBounds(fitBounds({ ...saved.bounds, width: 480, height: 720 }, area));
        window.setAlwaysOnTop(true, "floating");
      } else {
        restoreWindow(window, saved, screen);
      }
      mode = next;
      onMode(mode);
    }
    window.show(); window.focus();
    return mode;
  }
  return {
    mode: () => mode,
    setMode(next) {
      const result = transition.then(() => change(next));
      transition = result.catch(() => {});
      return result;
    },
  };
}

function restoreWindow(window, saved, screen) {
  const area = screen.getDisplayMatching(saved.bounds).workArea;
  window.setMinimumSize(...saved.minimum);
  window.setBounds(fitBounds(saved.bounds, area));
  window.setAlwaysOnTop(saved.always);
  if (saved.maximized) window.maximize();
  if (saved.fullscreen) window.setFullScreen(true);
}

function snapshot(window) {
  return {
    bounds: window.getNormalBounds(), minimum: window.getMinimumSize(),
    always: window.isAlwaysOnTop(), maximized: window.isMaximized(), fullscreen: window.isFullScreen(),
  };
}

function leaveFullscreen(window) {
  if (!window.isFullScreen()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timeout); resolve(); };
    const timeout = setTimeout(() => {
      window.removeListener("leave-full-screen", done);
      reject(new Error("Vanta could not leave full screen. Exit full screen and try Mini again."));
    }, 5000);
    window.once("leave-full-screen", done);
    window.setFullScreen(false);
  });
}

export function fitBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return { x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height };
}
