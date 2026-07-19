import type {ReactNode} from "react";
import {useState} from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import styles from "./index.module.css";

const desktopRelease =
  "https://github.com/jpoindexter/Vanta/releases/download/v0.9.4/Vanta-0.9.4-arm64.dmg";

const screens = [
  {
    id: "work",
    label: "Work",
    title: "The task stays central.",
    copy: "Conversation, tools, approvals, model scope, and run proof share one operator surface.",
    image: "/img/vanta-desktop-work-dark.webp",
    mobileImage: "/img/vanta-desktop-work-dark-mobile.webp",
    alt: "Vanta Desktop Work view showing projects, conversation, tool receipts, model scope, and approval controls",
  },
  {
    id: "connect",
    label: "Connect",
    title: "Setup has a visible next action.",
    copy: "Models, capabilities, MCP, messaging, and Google show ready, unavailable, or needs-setup states.",
    image: "/img/vanta-desktop-connect-light.webp",
    mobileImage: "/img/vanta-desktop-connect-light-mobile.webp",
    alt: "Vanta Desktop Connect view showing model, capability, MCP, messaging, and Google readiness",
  },
  {
    id: "models",
    label: "Models",
    title: "Choose the model for the task.",
    copy: "Search the live catalog, set a default, or keep a one-task override without leaving the work surface.",
    image: "/img/vanta-desktop-models-dark.webp",
    mobileImage: "/img/vanta-desktop-models-dark-mobile.webp",
    alt: "Vanta Desktop model picker showing current OpenAI models and task-specific selection",
  },
  {
    id: "approval",
    label: "Approvals",
    title: "Risk appears where the action happens.",
    copy: "The proposed change, target file, preview, and decision remain attached to the run that requested them.",
    image: "/img/vanta-desktop-approval-dark.webp",
    mobileImage: "/img/vanta-desktop-approval-dark-mobile.webp",
    alt: "Vanta Desktop approval request showing the target file, preview, allow once, and reject actions",
  },
] as const;

const capabilities = [
  ["Reach", "Desktop, terminal, Telegram, and approved gateway channels share one execution boundary.", "/comms-and-gateway"],
  ["Remember", "Durable project memory and optional Obsidian recall survive a single conversation.", "/skills-and-memory"],
  ["Schedule", "Goals, cron, heartbeats, and sentinels keep standing work visible and bounded.", "/autonomy"],
  ["Delegate", "Prompt presets and model routes give spawned agents focused jobs instead of swollen context.", "/prompt-presets-and-agents"],
  ["Research", "Source-aware research retains dates, freshness, uncertainty, and receipts.", "/tools"],
  ["Enforce", "A separate Rust kernel allows safe work, asks before consequence, and blocks hard boundaries.", "/safety-model"],
] as const;

const executionLayers = [
  ["Prompt", "The instruction for one call.", "Shipped"],
  ["Context", "Project rules, memory, retrieved files, and token discipline.", "Shipped"],
  ["Harness", "Tools, permissions, retries, hooks, and structured receipts.", "Shipped"],
  ["Loop", "Tests and external signals decide when work stops.", "Shipped"],
  ["Graph", "Multiple loops coordinate through typed state, routing, and human gates.", "Roadmap"],
] as const;

const executionContract = [
  ["Ask", "Name the outcome in your own words."],
  ["Gate", "The kernel checks scope and risk."],
  ["Work", "Tools and agents execute inside that boundary."],
  ["Verify", "Tests, artifacts, and receipts decide what is real."],
] as const;

export default function Home(): ReactNode {
  const [activeScreen, setActiveScreen] = useState<(typeof screens)[number]["id"]>("work");
  const currentScreen = screens.find((screen) => screen.id === activeScreen) ?? screens[0];

  return (
    <Layout
      title="Local operator for work that has to finish"
      description="Vanta is an open-source local operator with a macOS desktop app, durable memory, automation, agents, and a separate Rust safety kernel."
    >
      <main className={styles.page}>
        <header className={styles.hero}>
          <picture>
            <source media="(max-width: 680px)" srcSet="/img/vanta-operator-mobile.webp" />
            <img
              className={styles.heroImage}
              src="/img/vanta-operator.webp"
              alt=""
              width="1198"
              height="1800"
              fetchPriority="high"
            />
          </picture>
          <div className={styles.heroContent}>
            <p className={styles.releaseLine}>Desktop v0.9.4 / notarized for Apple silicon / open source</p>
            <h1>Vanta</h1>
            <p className={styles.heroStatement}>Local intelligence. Real boundaries. Work that finishes.</p>
            <p className={styles.heroCopy}>
              Give Vanta an outcome. It plans, uses tools, remembers context, and keeps standing work moving while a separate Rust kernel checks every action.
            </p>
            <a className={styles.downloadAction} href={desktopRelease}>Download Vanta for macOS</a>
            <div className={styles.terminalInstall} aria-label="Terminal install command">
              <span aria-hidden="true">$</span>
              <code>curl -fsSL https://vanta.theft.studio/install.sh | bash</code>
            </div>
          </div>
          <p className={styles.heroIndex}>VNT-A / trusted local operator</p>
        </header>

        <section className={styles.releaseProof} aria-label="Release verification">
          <div className={styles.releaseProofInner}>
            <p><strong>v0.9.4</strong><span>current desktop release</span></p>
            <p><strong>36</strong><span>Ghost visual gates</span></p>
            <p><strong>10 sec</strong><span>packaged-start ceiling</span></p>
            <p><strong>Accepted</strong><span>Apple notarization</span></p>
          </div>
        </section>

        <section className={styles.product} aria-labelledby="product-title">
          <div className={styles.sectionFrame}>
            <div className={styles.productHeading}>
              <h2 id="product-title">One place to run the work and inspect the proof.</h2>
              <p>Vanta Desktop is the daily operator surface. The terminal and approved messaging channels use the same project state and kernel boundary.</p>
            </div>

            <div className={styles.screenTabs} role="tablist" aria-label="Vanta Desktop views">
              {screens.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  role="tab"
                  aria-selected={activeScreen === screen.id}
                  aria-controls="desktop-screen"
                  id={`screen-tab-${screen.id}`}
                  onClick={() => setActiveScreen(screen.id)}
                >
                  {screen.label}
                </button>
              ))}
            </div>

            <figure
              className={styles.productFigure}
              id="desktop-screen"
              role="tabpanel"
              aria-labelledby={`screen-tab-${currentScreen.id}`}
            >
              <picture key={currentScreen.id}>
                <source media="(max-width: 680px)" srcSet={currentScreen.mobileImage} />
                <img
                  src={currentScreen.image}
                  alt={currentScreen.alt}
                  width="1440"
                  height="960"
                />
              </picture>
              <figcaption>
                <strong>{currentScreen.title}</strong>
                <span>{currentScreen.copy}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className={styles.capabilitySection} aria-labelledby="capability-title">
          <div className={styles.sectionFrame}>
            <h2 id="capability-title">The operator gets broader. The boundary stays put.</h2>
            <div className={styles.capabilityRows}>
              {capabilities.map(([name, copy, to], index) => (
                <article key={name}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <h3>{name}</h3>
                  <p>{copy}</p>
                  <Link to={to} aria-label={`Read about ${name}`}>Read</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.executionSection} aria-labelledby="execution-title">
          <div className={styles.sectionFrame}>
            <div className={styles.executionHeading}>
              <h2 id="execution-title">From one instruction to an operating system for work.</h2>
              <p>Vanta already handles the prompt, context, harness, and loop. Typed multi-agent graph orchestration is the next layer, and it remains marked as roadmap work until its real gates pass.</p>
            </div>
            <ol className={styles.executionLayers}>
              {executionLayers.map(([name, copy, status]) => (
                <li key={name}>
                  <div><strong>{name}</strong><span>{status}</span></div>
                  <p>{copy}</p>
                </li>
              ))}
            </ol>
            <Link className={styles.roadmapLink} to="/roadmap">Inspect shipped and open work</Link>
          </div>
        </section>

        <section className={styles.contractSection} aria-labelledby="contract-title">
          <div className={styles.sectionFrame}>
            <h2 id="contract-title">The model does not approve itself.</h2>
            <p className={styles.contractLead}>Every proposed action crosses a deterministic kernel before execution. Safe work proceeds, consequential work waits, and hard boundaries remain blocked.</p>
            <ol className={styles.contractFlow}>
              {executionContract.map(([name, copy], index) => (
                <li key={name}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <h3>{name}</h3>
                  <p>{copy}</p>
                </li>
              ))}
            </ol>
            <Link className={styles.inverseLink} to="/safety-model">Read the safety model</Link>
          </div>
        </section>

        <section className={styles.realRun} aria-labelledby="run-title">
          <div className={styles.sectionFrame}>
            <div className={styles.runHeading}>
              <h2 id="run-title">Watch a real operator run.</h2>
              <p>No concept render and no montage. This is Vanta taking an instruction through the terminal loop.</p>
            </div>
            <figure className={styles.demoFigure}>
              <video
                autoPlay
                muted
                loop
                playsInline
                controls
                preload="metadata"
                poster="/img/vanta-terminal-demo-poster.webp"
                aria-label="Vanta executing a task in the terminal"
              >
                <source src="/img/vanta-terminal-demo.mp4" type="video/mp4" />
              </video>
              <figcaption>Recorded product path / terminal operator loop</figcaption>
            </figure>
          </div>
        </section>

        <section className={styles.installSection} aria-labelledby="install-title">
          <div className={styles.sectionFrame}>
            <h2 id="install-title">Give it one real task.</h2>
            <div className={styles.installMethods}>
              <div>
                <h3>Vanta Desktop</h3>
                <p>Signed, notarized, and stapled for Apple silicon.</p>
                <a href={desktopRelease}>Download v0.9.4 DMG</a>
              </div>
              <div>
                <h3>Terminal</h3>
                <p>Install the operator and kernel from the command line.</p>
                <code>curl -fsSL https://vanta.theft.studio/install.sh | bash</code>
              </div>
              <div>
                <h3>Source</h3>
                <p>Inspect the code, release evidence, and open roadmap.</p>
                <a href="https://github.com/jpoindexter/Vanta">Open GitHub</a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
