export function desktopHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vanta Desktop</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07090d;color:#e7ebf2;font:14px/1.5 system-ui,sans-serif}
      main{max-width:520px;border:1px solid #27303b;border-radius:8px;background:#10141b;padding:24px}
      h1{margin:0 0 8px;font-size:22px}
      p{margin:0;color:#8d98a8}
      code{color:#68b7c8}
    </style>
  </head>
  <body>
    <main>
      <h1>Vanta Desktop</h1>
      <p>React desktop assets are not built yet. Run <code>npm run desktop:build</code> from <code>vanta-ts/</code>, then reload.</p>
    </main>
  </body>
</html>`;
}
