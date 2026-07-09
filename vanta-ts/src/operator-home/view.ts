import { readStack } from "../task-stack/store.js";
import { listBgTasks } from "../tools/bg-tasks.js";
import { loadCron } from "../schedule/cron.js";
import { listSkills } from "../skills/store.js";
import { getMemoryFootprint } from "../memory/forget.js";
import { checkAll } from "../reach/registry.js";
import { gatherCapabilities } from "../repl/health-cmd.js";
import { workflowViews } from "../repl/what-can-i-do-cmd.js";

export type HomeSection = {
  name: string;
  status: "ok" | "setup" | "watch";
  detail: string;
  next: string;
};

export type HomeSnapshot = {
  sections: HomeSection[];
};

function section(name: string, status: HomeSection["status"], detail: string, next: string): HomeSection {
  return { name, status, detail, next };
}

export function formatOperatorHome(snapshot: HomeSnapshot): string {
  const rows = snapshot.sections.map((s) => [
    `  [${s.status}] ${s.name}`,
    `    ${s.detail}`,
    `    Next: ${s.next}`,
  ].join("\n"));
  return ["Operator Home\nWhat Vanta can do now, what is running, and what needs setup.", ...rows].join("\n\n");
}

export async function buildOperatorHome(opts: {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  toolNames: string[];
}): Promise<string> {
  const [stack, bgTasks, cron, skills, memory, reach, caps] = await Promise.all([
    readStack(opts.dataDir),
    listBgTasks(opts.dataDir),
    loadCron(opts.dataDir),
    listSkills(opts.env),
    getMemoryFootprint(opts.env),
    checkAll(opts.env),
    gatherCapabilities(opts.env),
  ]);
  return formatOperatorHome({ sections: [
    workflowSection(opts.toolNames),
    channelsSection(reach),
    skillsSection(skills.length),
    agentsSection(stack.tasks.length, bgTasks.filter((t) => t.status === "running").length),
    memorySection(memory.goals, memory.totalBytes),
    watchersSection(cron.filter((c) => c.status === "active").length),
    setupSection(caps.filter((c) => !c.ok).length),
  ] });
}

function workflowSection(toolNames: string[]): HomeSection {
  const views = workflowViews(toolNames);
  const run = views.filter((v) => v.state === "Run").length;
  const tryCount = views.filter((v) => v.state === "Try").length;
  const setupCount = views.length - run - tryCount;
  return section("Workflows", run ? "ok" : "setup", `${run} run, ${tryCount} try, ${setupCount} setup`, "/what-can-i-do or `vanta what-can-i-do --check`");
}

function channelsSection(reach: Array<{ status: "ok" | "warn" | "off" }>): HomeSection {
  const ok = reach.filter((c) => c.status === "ok").length;
  const warn = reach.filter((c) => c.status === "warn").length;
  const off = reach.length - ok - warn;
  return section("Channels", off ? "setup" : "ok", `${ok} ready, ${warn} degraded, ${off} setup`, "/reach for exact channel fixes");
}

function skillsSection(count: number): HomeSection {
  return section("Skills", count ? "ok" : "setup", `${count} installed skill(s)`, count ? "/skills" : "`vanta skills install`");
}

function agentsSection(tasks: number, runningBg: number): HomeSection {
  const status = tasks || runningBg ? "watch" : "ok";
  return section("Agents/Tasks", status, `${tasks} task(s), ${runningBg} background shell task(s) running`, "/tasks next, /agents, or `vanta agents`");
}

function memorySection(goals: number, bytes: number): HomeSection {
  return section("Memory", bytes ? "ok" : "setup", `${goals} goal memory file(s), ${bytes} bytes`, "/memory <note> or `vanta memory footprint`");
}

function watchersSection(activeCron: number): HomeSection {
  return section("Watchers", activeCron ? "watch" : "setup", `${activeCron} active scheduled watcher(s)`, "`vanta schedule \"check this repo\" --cron \"0 9 * * *\"`");
}

function setupSection(missingCaps: number): HomeSection {
  return section("Setup", missingCaps ? "setup" : "ok", missingCaps ? `${missingCaps} capability gap(s)` : "all checked capabilities ready", "/health or `vanta setup`");
}
