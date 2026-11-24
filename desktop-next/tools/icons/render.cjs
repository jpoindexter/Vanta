// Electron main script: rasterizes HTML jobs to transparent PNGs (an SVG renderer that needs no extra dependency).
//   electron render.cjs <jobs.json>      jobs: [{ html, width, height, out }]
const fs = require("node:fs");
const { app, BrowserWindow } = require("electron");

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("disable-gpu");
app.dock?.hide();
app.on("window-all-closed", () => {});

async function render({ html, width, height, out }) {
  const window = new BrowserWindow({
    frame: false, height, show: false, transparent: true, useContentSize: true, width,
    webPreferences: { backgroundThrottling: false },
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
  fs.writeFileSync(out, image.toPNG());
  window.destroy();
}

app.whenReady().then(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  for (const job of jobs) await render(job);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
