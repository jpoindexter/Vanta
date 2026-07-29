#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { arch, availableParallelism, cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron as electron } from "playwright-core";
import { issuePublicApiToken } from "../src/public-api/auth.js";
import {
  TTFT_METRICS,
  buildTtftReceipt,
  evaluateTtftBudgets,
  sampleMetrics,
  ttftFailureMessage,
} from "./lib/ttft-performance.mjs";

const exec = promisify(execFile);
const root = process.cwd();
const repo = resolve(root, "..");
const command = process.env.VANTA_COMMAND ?? resolve(repo, "run.sh");
const provider = process.env.VANTA_TTFT_PROVIDER ?? "ollama";
const model = process.env.VANTA_TTFT_MODEL ?? "qwen2.5:14b";
const target = `${platform()}-${arch()}`;
const samplesPerGroup = integerArg("--samples", 5);
const surfaces = listArg("--surfaces", ["cli", "tui", "gateway", "desktop"]);
const modes = listArg("--modes", ["fresh", "warm"]);
const update = process.argv.includes("--update");
const partial = process.argv.includes("--partial");
const outputPath = resolve(valueArg("--output") ?? `.artifacts/ttft-${target}.json`);
const baselinePath = resolve(valueArg("--baseline") ?? `scripts/fixtures/ttft-baseline-${target}.json`);
const budgetPath = resolve(valueArg("--budgets") ?? "scripts/fixtures/ttft-performance-budgets.json");
const appPath = resolve(process.env.VANTA_DESKTOP_APP ?? `release/mac-${arch() === "arm64" ? "arm64" : "x64"}/Vanta.app`);
const scratch = [];

if (process.env.VANTA_TTFT_LIVE !== "1") {
  throw new Error("Refusing provider use. Re-run with VANTA_TTFT_LIVE=1.");
}
if (samplesPerGroup < 5 && !partial) throw new Error("TTFT requires at least five samples per surface/profile group");
for (const surface of surfaces) if (!["cli", "tui", "gateway", "desktop"].includes(surface)) throw new Error(`unknown TTFT surface: ${surface}`);
for (const mode of modes) if (!["fresh", "warm"].includes(mode)) throw new Error(`unknown TTFT profile mode: ${mode}`);
if (update && (surfaces.length !== 4 || modes.length !== 2)) throw new Error("baseline updates require all four surfaces and both profile modes");

const providerProof = await verifyLiveProvider(provider, model);
const signed = surfaces.includes("desktop") ? await verifySignedApp(appPath) : false;
const samples = [];
let port = Number(process.env.VANTA_TTFT_BASE_PORT ?? "7960");

try {
  for (const surface of surfaces) {
    for (const profileMode of modes) {
      const warmPaths = profileMode === "warm" ? await makeProfile(`${surface}-warm`) : null;
      for (let sampleIndex = 1; sampleIndex <= samplesPerGroup; sampleIndex += 1) {
        const paths = warmPaths ?? await makeProfile(`${surface}-fresh-${sampleIndex}`);
        const sample = surface === "desktop"
          ? await runDesktopSample({ paths, profileMode, sampleIndex })
          : surface === "gateway"
            ? await runGatewaySample({ paths, profileMode, sampleIndex, port: port++ })
            : await runTerminalSample({ surface, paths, profileMode, sampleIndex });
        samples.push({
          ...sample,
          providerMode: providerProof.mode,
          provider: providerProof.id,
          model: providerProof.model,
          packaged: surface === "desktop",
          signed: surface === "desktop" ? signed : undefined,
        });
        process.stdout.write(`${surface}:${profileMode} ${sampleIndex}/${samplesPerGroup} · first paint ${Math.round(sample.metrics.submitToFirstPaintMs)}ms\n`);
      }
    }
  }

  const receipt = buildTtftReceipt({
    samples,
    machine: {
      platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown",
      logicalCpus: availableParallelism(), memoryBytes: totalmem(),
    },
    build: await buildMetadata(),
  });
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (!receipt.eligibleBaseline && !partial) throw new Error(`TTFT receipt is not baseline-eligible:\n${receipt.eligibilityErrors.join("\n")}`);

  if (partial) {
    process.stdout.write(`${JSON.stringify({ ttft: true, partial: true, target, samples: samples.length, receipt: outputPath, eligibilityErrors: receipt.eligibilityErrors })}\n`);
  } else if (update) {
    await mkdir(resolve(baselinePath, ".."), { recursive: true });
    await writeFile(baselinePath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const budgets = budgetsFrom(receipt);
    await writeFile(budgetPath, `${JSON.stringify(budgets, null, 2)}\n`, "utf8");
  } else {
    const budgets = JSON.parse(await readFile(budgetPath, "utf8"));
    const result = evaluateTtftBudgets(receipt, budgets);
    if (!result.passed) throw new Error(`TTFT regression budget failed:\n${ttftFailureMessage(result)}`);
  }
  if (!partial) process.stdout.write(`${JSON.stringify({ ttft: true, target, samples: samples.length, provider: providerProof, signedDesktop: signed, receipt: outputPath, baselineUpdated: update })}\n`);
} finally {
  await Promise.all(scratch.map((path) => rm(path, { recursive: true, force: true })));
}

async function runTerminalSample({ surface, paths, profileMode, sampleIndex }) {
  const session = `vanta-ttft-${surface}-${process.pid}-${sampleIndex}-${randomUUID().slice(0, 6)}`;
  const tracePath = join(paths.home, `ttft-${surface}-${profileMode}-${sampleIndex}.jsonl`);
  const marker = `§${randomUUID().replaceAll("-", "")}`;
  const readyText = surface === "cli" ? "vanta ›" : "Ask Vanta anything";
  const args = surface === "cli" ? "chat --no-tui" : "chat";
  const processStartedAtMs = Date.now();
  try {
    await tmux("new-session", "-d", "-s", session, "-x", "100", "-y", "32", shellCommand(
      runtimeEnv(paths.home, tracePath, surface),
      command,
      root,
      args,
    ));
    await waitForPane(session, (pane) => pane.includes(readyText), 180_000, `interactive marker ${readyText}`);
    const interactiveAtMs = Date.now();
    const prompt = `Reply with exactly ${marker} and no other text.`;
    await tmux("send-keys", "-t", session, "-l", prompt);
    await delay(50);
    const beforeSubmitCount = occurrences(await capture(session), "§");
    const submittedAtMs = Date.now();
    await tmux("send-keys", "-t", session, "Enter");
    const trace = await waitForTrace(tracePath, 180_000);
    await waitForPane(session, (pane) => occurrences(pane, "§") > beforeSubmitCount, 180_000, "first painted response token");
    const firstPaintedAtMs = Date.now();
    const timestamps = timestampsFromTrace({ processStartedAtMs, interactiveAtMs, submittedAtMs, firstPaintedAtMs }, trace);
    return makeSample(surface, profileMode, sampleIndex, timestamps, "terminal_cell");
  } finally {
    await tmux("kill-session", "-t", session).catch(() => {});
  }
}

async function runGatewaySample({ paths, profileMode, sampleIndex, port: samplePort }) {
  const tracePath = join(paths.home, `ttft-gateway-${profileMode}-${sampleIndex}.jsonl`);
  const marker = `§${randomUUID().replaceAll("-", "")}`;
  const issued = await issuePublicApiToken(paths.home, "TTFT harness");
  const child = spawn(command, ["api", "serve", String(samplePort)], {
    cwd: root,
    env: runtimeEnv(paths.home, tracePath, "gateway"),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const processStartedAtMs = Date.now();
  const base = `http://127.0.0.1:${samplePort}/api/v1`;
  const headers = { authorization: `Bearer ${issued.token}`, "x-session-id": `ttft-${randomUUID()}` };
  try {
    await waitForHttp(`${base}/live`, {}, 180_000);
    const interactiveAtMs = Date.now();
    const stream = await fetch(`${base}/events`, { headers });
    assert.equal(stream.ok, true, `gateway event stream failed (${stream.status})`);
    const firstOutput = firstSseDelta(stream);
    const submittedAtMs = Date.now();
    const response = fetch(`${base}/input`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message: `Reply with exactly ${marker} and no other text.` }),
    });
    const firstPaintedAtMs = await firstOutput;
    const completed = await response;
    assert.equal(completed.ok, true, `gateway input failed (${completed.status})`);
    const trace = await waitForTrace(tracePath, 180_000);
    const timestamps = timestampsFromTrace({ processStartedAtMs, interactiveAtMs, submittedAtMs, firstPaintedAtMs }, trace);
    return makeSample("gateway", profileMode, sampleIndex, timestamps, "delivered_sse_delta");
  } finally {
    killProcessGroup(child.pid, "SIGTERM");
    await Promise.race([new Promise((resolveClose) => child.once("close", resolveClose)), delay(2_000)]);
    killProcessGroup(child.pid, "SIGKILL");
  }
}

async function runDesktopSample({ paths, profileMode, sampleIndex }) {
  const tracePath = join(paths.home, `ttft-desktop-${profileMode}-${sampleIndex}.jsonl`);
  const marker = `§${randomUUID().replaceAll("-", "")}`;
  const processStartedAtMs = Date.now();
  const app = await electron.launch({
    executablePath: join(appPath, "Contents", "MacOS", "Vanta"),
    args: ["--project", paths.project],
    cwd: root,
    env: {
      ...runtimeEnv(paths.home, tracePath, "desktop"),
      VANTA_DESKTOP_USER_DATA: paths.userData,
      VANTA_DESKTOP_PORT: String(Number(process.env.VANTA_TTFT_DESKTOP_PORT ?? "8060") + sampleIndex),
      VANTA_DESKTOP_AUTOMATION: "1",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  const appProcess = app.process();
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(180_000);
    await page.locator(".app-shell").waitFor();
    await page.locator("#vanta-composer").waitFor();
    const interactiveAtMs = Date.now();
    await page.locator("#vanta-composer").fill(`Reply with exactly ${marker} and no other text.`);
    const firstPaint = page.evaluate((symbol) => new Promise((resolvePaint) => {
      const find = () => [...document.querySelectorAll(".message.assistant")].some((node) => node.textContent?.includes(symbol));
      const finish = () => requestAnimationFrame(() => resolvePaint(Date.now()));
      if (find()) return finish();
      const observer = new MutationObserver(() => {
        if (!find()) return;
        observer.disconnect();
        finish();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }), "§");
    const submittedAtMs = Date.now();
    await page.locator("#vanta-composer").press("Enter");
    const firstPaintedAtMs = await firstPaint;
    const trace = await waitForTrace(tracePath, 180_000);
    const timestamps = timestampsFromTrace({ processStartedAtMs, interactiveAtMs, submittedAtMs, firstPaintedAtMs }, trace);
    return makeSample("desktop", profileMode, sampleIndex, timestamps, "rendered_dom_animation_frame");
  } finally {
    await Promise.race([app.close(), delay(3_000)]);
    if (appProcess && !appProcess.killed) appProcess.kill("SIGKILL");
  }
}

async function makeProfile(label) {
  const container = await mkdtemp(join(tmpdir(), `vanta-ttft-${label}-`));
  scratch.push(container);
  const paths = { home: join(container, "home"), userData: join(container, "profile"), project: join(container, "project") };
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
  await writeFile(join(paths.project, "README.md"), "# TTFT performance harness\n", "utf8");
  return paths;
}

function runtimeEnv(home, tracePath, surface) {
  return {
    ...process.env,
    VANTA_HOME: home,
    VANTA_REPO: repo,
    VANTA_PROVIDER: provider,
    VANTA_MODEL: model,
    VANTA_TTFT_TRACE: tracePath,
    VANTA_TTFT_SURFACE: surface,
    VANTA_MCP_AUTO_MOUNT: "0",
    VANTA_TRUST_ALL: "1",
    VANTA_PROMPT_SUGGESTIONS: "0",
  };
}

async function waitForTrace(path, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const text = await readFile(path, "utf8").catch(() => "");
    const events = text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const byStage = Object.fromEntries(events.map((event) => [event.stage, event]));
    if (byStage.turn_started && byStage.provider_dispatch && byStage.provider_first_delta) return byStage;
    await delay(20);
  }
  throw new Error(`timed out waiting for complete TTFT trace: ${path}`);
}

function timestampsFromTrace(external, trace) {
  return {
    ...external,
    turnStartedAtMs: trace.turn_started.wallTimeUnixMs,
    providerDispatchAtMs: trace.provider_dispatch.wallTimeUnixMs,
    providerFirstDeltaAtMs: trace.provider_first_delta.wallTimeUnixMs,
  };
}

function makeSample(surface, profileMode, sampleIndex, timestamps, outputObservation) {
  return {
    surface,
    profileMode,
    sampleIndex,
    outputObservation,
    timestamps,
    metrics: sampleMetrics(timestamps),
  };
}

async function firstSseDelta(response) {
  if (!response.body) throw new Error("gateway event stream has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        const event = JSON.parse(data);
        if (event.type === "output.delta" && event.delta) return Date.now();
      }
      if (done) throw new Error("gateway event stream ended before output");
    }
  } finally {
    reader.releaseLock();
  }
}

async function verifyLiveProvider(id, selectedModel) {
  if (id !== "ollama") return { mode: "unverified", id, model: selectedModel };
  const base = process.env.VANTA_OLLAMA_URL?.replace(/\/v1\/?$/, "") ?? "http://127.0.0.1:11434";
  const response = await fetch(`${base}/api/tags`);
  if (!response.ok) throw new Error(`Ollama discovery failed (${response.status})`);
  const body = await response.json();
  const found = body.models?.find((entry) => entry.name === selectedModel || entry.model === selectedModel);
  if (!found?.digest) throw new Error(`Ollama model is not installed: ${selectedModel}`);
  return { mode: "live", id, model: selectedModel, local: true, modelDigest: found.digest };
}

async function verifySignedApp(path) {
  const { stdout, stderr } = await exec("codesign", ["--verify", "--deep", "--strict", "--verbose=2", path]);
  void stdout;
  void stderr;
  const detail = await exec("codesign", ["-dv", "--verbose=2", path]).catch((error) => ({ stderr: error.stderr ?? "" }));
  if (!String(detail.stderr).includes("Authority=Developer ID Application:")) throw new Error(`Desktop app is not Developer ID signed: ${path}`);
  return true;
}

async function buildMetadata() {
  const sha = (await exec("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
  const status = (await exec("git", ["status", "--short"], { cwd: repo })).stdout.trim();
  return { sha, dirty: Boolean(status), packageVersion: JSON.parse(await readFile(join(root, "package.json"), "utf8")).version };
}

function budgetsFrom(receipt) {
  return {
    version: 1,
    target,
    sourceReceipt: baselinePath.replace(`${root}/`, ""),
    groups: Object.fromEntries(Object.entries(receipt.groups).map(([id, group]) => [
      id,
      Object.fromEntries(TTFT_METRICS.map((metric) => {
        const baselineP95 = group.summary[metric].p95;
        return [metric, {
          baselineP95,
          regressionPercent: 25,
          maxP95: Math.ceil(Math.max(baselineP95 * 2, baselineP95 + 1_000)),
        }];
      })),
    ])),
  };
}

async function waitForHttp(url, init, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return;
    } catch {}
    await delay(50);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function waitForPane(session, predicate, timeoutMs, label) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const pane = await capture(session);
    if (predicate(pane)) return pane;
    await delay(20);
  }
  throw new Error(`timed out waiting for ${label}\n${await capture(session).catch(() => "")}`);
}

async function capture(session) {
  return (await tmux("capture-pane", "-t", session, "-p")).stdout;
}

function tmux(...args) {
  return exec("tmux", args, { maxBuffer: 2_000_000 });
}

function shellCommand(env, executable, cwd, args = "") {
  const vars = Object.entries(env).map(([key, value]) => `${key}=${quote(value)}`).join(" ");
  return `cd ${quote(cwd)} && env ${vars} ${quote(executable)} ${args}`;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function occurrences(text, targetText) {
  return text.split(targetText).length - 1;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function killProcessGroup(pid, signal) {
  if (!pid) return;
  try { process.kill(-pid, signal); } catch {}
}

function valueArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function integerArg(name, fallback) {
  const value = Number(valueArg(name) ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function listArg(name, fallback) {
  return (valueArg(name)?.split(",") ?? fallback).map((value) => value.trim()).filter(Boolean);
}
