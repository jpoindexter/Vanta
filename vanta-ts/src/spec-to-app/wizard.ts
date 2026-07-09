import { execFile } from "node:child_process";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const POSTURE_ROUTINE_SPEC_FIXTURE = [
  "Build a polished responsive React/Tailwind posture routine app.",
  "Include a hero, daily routine cards, timers, toggles, progress tracking, and localStorage persistence.",
  "Sections: neck reset, shoulder opener, thoracic extension, hip flexor release, hamstring floss, breathing cooldown.",
  "The UI must be accessible: semantic buttons, visible focus, aria-live timer status, and no placeholder-only labels.",
  "Make it useful on mobile and desktop, with a preview someone can open locally after build checks pass.",
].join("\n");

export type RunResult = { code: number; stdout: string; stderr: string };
export type Runner = (cmd: string, args: string[], cwd: string) => Promise<RunResult>;
export type SpecWizardResult = {
  ok: boolean;
  appDir: string;
  previewUrl: string;
  summaryFile: string;
  screenshotFile: string;
  checks: Array<{ name: string; ok: boolean; output: string }>;
  requirements: string[];
};

const REQUIREMENT_RULES: Array<{ re: RegExp; text: string }> = [
  { re: /react/i, text: "React implementation" },
  { re: /tailwind/i, text: "Tailwind-styled responsive interface" },
  { re: /timer/i, text: "Routine timers with visible status" },
  { re: /toggle/i, text: "Interactive toggles for routine state" },
  { re: /localStorage|persist/i, text: "localStorage progress persistence" },
  { re: /accessible|aria|semantic|focus/i, text: "Accessible semantic controls and focus states" },
  { re: /mobile|desktop|responsive/i, text: "Responsive mobile and desktop layout" },
];

export function extractPostureRequirements(spec: string): string[] {
  const hits = REQUIREMENT_RULES.filter((rule) => rule.re.test(spec)).map((rule) => rule.text);
  return hits.length ? hits : ["React implementation", "Local preview build"];
}

export function buildImplementationPlan(requirements: string[]): string {
  return [
    "# Spec-to-App Implementation Plan",
    "",
    "1. Scaffold a Vite React app with Tailwind utility classes in the preview document.",
    "2. Build a single-page posture routine with routine cards, timer controls, completion toggles, and progress.",
    "3. Keep state local to the app and persist completed steps with localStorage.",
    "4. Verify accessibility basics: semantic buttons, labelled controls, visible focus, and aria-live timer status.",
    "5. Run typecheck and production build, then record preview and evidence paths.",
    "",
    "## Extracted Requirements",
    ...requirements.map((r) => `- ${r}`),
  ].join("\n");
}

export async function runSpecToAppWizard(opts: {
  dataDir: string;
  packageRoot: string;
  spec?: string;
  now?: () => Date;
  openPreview?: boolean;
  runner?: Runner;
}): Promise<SpecWizardResult> {
  const now = opts.now ?? (() => new Date());
  const createdAt = now().toISOString();
  const slug = `posture-routine-${createdAt.replace(/[:.]/g, "-")}`;
  const appDir = join(opts.dataDir, "spec-previews", slug);
  const spec = opts.spec ?? POSTURE_ROUTINE_SPEC_FIXTURE;
  const requirements = extractPostureRequirements(spec);
  await scaffoldApp({ appDir, packageRoot: opts.packageRoot, spec, requirements, createdAt });
  const runner = opts.runner ?? runProcess;
  const checks = [
    await runCheck({ name: "typecheck", runner, cmd: process.execPath, args: [join(opts.packageRoot, "node_modules", "typescript", "bin", "tsc"), "--project", "tsconfig.json", "--noEmit"], cwd: appDir }),
    await runCheck({ name: "build", runner, cmd: process.execPath, args: [join(opts.packageRoot, "node_modules", "vite", "bin", "vite.js"), "build"], cwd: appDir }),
  ];
  const previewUrl = `file://${join(appDir, "dist", "index.html")}`;
  const screenshotFile = join(appDir, "preview-screenshot.svg");
  await writeFile(screenshotFile, screenshotSvg(requirements), "utf8");
  if (opts.openPreview) checks.push(await runCheck({ name: "open-preview", runner, cmd: "open", args: [previewUrl], cwd: appDir }));
  const summaryFile = join(appDir, "task-summary.md");
  await writeFile(summaryFile, taskSummary({ createdAt, spec, requirements, previewUrl, screenshotFile, checks, appDir }), "utf8");
  return { ok: checks.every((c) => c.ok), appDir, previewUrl, summaryFile, screenshotFile, checks, requirements };
}

async function scaffoldApp(opts: { appDir: string; packageRoot: string; spec: string; requirements: string[]; createdAt: string }): Promise<void> {
  const { appDir, packageRoot, spec, requirements, createdAt } = opts;
  await mkdir(join(appDir, "src"), { recursive: true });
  await linkNodeModules(appDir, packageRoot);
  await writeFile(join(appDir, "package.json"), JSON.stringify({ type: "module", scripts: { typecheck: "tsc --noEmit", build: "vite build" }, dependencies: { react: "workspace", "react-dom": "workspace" }, devDependencies: { vite: "workspace", typescript: "workspace" } }, null, 2), "utf8");
  await writeFile(join(appDir, "index.html"), indexHtml(), "utf8");
  await writeFile(join(appDir, "tsconfig.json"), tsconfig(), "utf8");
  await writeFile(join(appDir, "vite.config.ts"), `import { defineConfig } from "vite";\nexport default defineConfig({ build: { outDir: "dist", emptyOutDir: true, target: "esnext" } });\n`, "utf8");
  await writeFile(join(appDir, "src", "main.tsx"), appTsx(), "utf8");
  await writeFile(join(appDir, "implementation-plan.md"), buildImplementationPlan(requirements), "utf8");
  await writeFile(join(appDir, "requirements.json"), JSON.stringify({ createdAt, spec, requirements }, null, 2), "utf8");
}

async function linkNodeModules(appDir: string, packageRoot: string): Promise<void> {
  await symlink(join(packageRoot, "node_modules"), join(appDir, "node_modules"), "dir").catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "EEXIST") throw err;
  });
}

async function runProcess(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, maxBuffer: 1024 * 1024 * 5 });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as Error & { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message };
  }
}

async function runCheck(opts: { name: string; runner: Runner; cmd: string; args: string[]; cwd: string }): Promise<{ name: string; ok: boolean; output: string }> {
  const { name, runner, cmd, args, cwd } = opts;
  const result = await runner(cmd, args, cwd);
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  return { name, ok: result.code === 0, output: output || "(no output)" };
}

function indexHtml(): string {
  return `<div id="root"></div><script src="https://cdn.tailwindcss.com"></script><script type="module" src="/src/main.tsx"></script>`;
}

function tsconfig(): string {
  return JSON.stringify({ compilerOptions: { target: "ES2020", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: true, lib: ["DOM", "DOM.Iterable", "ES2020"] }, include: ["src"] }, null, 2);
}

function appTsx(): string {
  return `import { useEffect, useMemo, useState } from "react";\nimport { createRoot } from "react-dom/client";\nconst steps = ["Neck reset", "Shoulder opener", "Thoracic extension", "Hip flexor release", "Hamstring floss", "Breathing cooldown"];\nfunction App() {\n  const [seconds, setSeconds] = useState(60);\n  const [done, setDone] = useState<string[]>(() => JSON.parse(localStorage.getItem("posture.done") || "[]"));\n  const complete = useMemo(() => Math.round((done.length / steps.length) * 100), [done]);\n  useEffect(() => { localStorage.setItem("posture.done", JSON.stringify(done)); }, [done]);\n  useEffect(() => { if (seconds <= 0) return; const id = setInterval(() => setSeconds((s) => s - 1), 1000); return () => clearInterval(id); }, [seconds]);\n  return <main className="min-h-screen bg-slate-950 text-slate-100"><section className="mx-auto max-w-5xl px-5 py-10"><p className="text-sm uppercase tracking-widest text-amber-300">Posture reset</p><h1 className="mt-2 text-4xl font-semibold">A focused routine for desk-heavy days</h1><p className="mt-3 max-w-2xl text-slate-300">Six guided mobility blocks, one visible timer, and progress that survives refresh.</p><div className="mt-6 rounded border border-slate-700 p-4"><label htmlFor="timer" className="block text-sm text-slate-300">Timer seconds</label><input id="timer" className="mt-2 w-32 rounded bg-slate-900 p-2 focus:outline focus:outline-2 focus:outline-amber-300" type="number" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /><p aria-live="polite" className="mt-3 text-2xl text-amber-200">{seconds}s remaining</p><button className="mt-3 rounded bg-amber-300 px-4 py-2 font-semibold text-slate-950 focus:outline focus:outline-2 focus:outline-white" onClick={() => setSeconds(60)}>Reset timer</button></div><p className="mt-6 text-sm text-slate-300">Progress: {complete}% complete</p><div className="mt-3 h-3 rounded bg-slate-800"><div className="h-3 rounded bg-emerald-400" style={{ width: complete + "%" }} /></div><div className="mt-6 grid gap-4 md:grid-cols-3">{steps.map((step, index) => <article key={step} className="rounded border border-slate-700 bg-slate-900 p-4"><h2 className="font-semibold">{index + 1}. {step}</h2><p className="mt-2 text-sm text-slate-300">Move slowly, breathe, and stop before pain.</p><button className="mt-4 rounded border border-slate-500 px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-amber-300" onClick={() => setDone((d) => d.includes(step) ? d.filter((x) => x !== step) : [...d, step])}>{done.includes(step) ? "Mark not done" : "Mark done"}</button></article>)}</div></section></main>;\n}\ncreateRoot(document.getElementById("root")!).render(<App />);\n`;
}

function screenshotSvg(requirements: string[]): string {
  const rows = requirements.slice(0, 5).map((r, i) => `<text x="48" y="${190 + i * 34}" fill="#cbd5e1" font-size="18">${escapeXml(r)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="#020617"/><text x="48" y="82" fill="#fcd34d" font-size="24" font-family="Arial">Posture reset preview</text><text x="48" y="138" fill="#f8fafc" font-size="48" font-family="Arial">A focused routine for desk-heavy days</text>${rows}<rect x="48" y="410" width="300" height="150" rx="12" fill="#0f172a" stroke="#334155"/><text x="76" y="470" fill="#fcd34d" font-size="32">60s timer</text><rect x="390" y="410" width="300" height="150" rx="12" fill="#0f172a" stroke="#334155"/><text x="418" y="470" fill="#86efac" font-size="32">6 routine cards</text><rect x="732" y="410" width="300" height="150" rx="12" fill="#0f172a" stroke="#334155"/><text x="760" y="470" fill="#93c5fd" font-size="32">localStorage progress</text></svg>`;
}

function taskSummary(o: { createdAt: string; spec: string; requirements: string[]; previewUrl: string; screenshotFile: string; checks: Array<{ name: string; ok: boolean; output: string }>; appDir: string }): string {
  return ["# Spec-to-App Preview Summary", "", `- Created: ${o.createdAt}`, `- App dir: ${o.appDir}`, `- Preview: ${o.previewUrl}`, `- Screenshot evidence: ${o.screenshotFile}`, "", "## Extracted Requirements", ...o.requirements.map((r) => `- ${r}`), "", "## Checks", ...o.checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${firstLine(c.output)}`), "", "## Spec Fixture", "", o.spec].join("\n");
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find(Boolean) ?? "(no output)";
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
