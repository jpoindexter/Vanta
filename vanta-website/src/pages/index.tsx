import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

const workflow = [
  ['01', 'Ask', 'Give Vanta the outcome in your own words.'],
  ['02', 'Gate', 'The Rust kernel checks scope and risk before every action.'],
  ['03', 'Work', 'Tools, models, memory, and agents execute inside that boundary.'],
  ['04', 'Verify', 'Tests, artifacts, and receipts show what actually happened.'],
];

const capabilities = [
  {
    number: '01', verb: 'Reach', title: 'One operator. Every approved surface.',
    copy: 'Start in the terminal or desktop, then add configured messaging channels. The gateway routes the request; the execution boundary does not change.',
    signals: ['Terminal and desktop', 'Gateway-routed channels', 'Shared session continuity'],
    to: '/comms-and-gateway', link: 'See communication paths',
  },
  {
    number: '02', verb: 'Remember', title: 'Context that survives the conversation.',
    copy: 'Vanta preserves durable project memory, recalls prior work, and can bridge approved knowledge into Obsidian without making the model the source of truth.',
    signals: ['Durable brain memory', 'Recall across sessions', 'Optional Obsidian bridge'],
    to: '/skills-and-memory', link: 'Inspect memory controls',
  },
  {
    number: '03', verb: 'Schedule', title: 'Standing work with explicit wake rules.',
    copy: 'Goals, schedules, cron jobs, heartbeats, and sentinels keep recurring work moving while autonomy contracts define when Vanta acts, queues, or wakes you.',
    signals: ['Natural-language schedules', 'Goal sentinels', 'Acts / queues / wakes'],
    to: '/autonomy', link: 'Review autonomy contracts',
  },
  {
    number: '04', verb: 'Delegate', title: 'Focused agents, not one swollen context.',
    copy: 'Spawn agents with task-specific system prompts and model routes. Each worker gets a bounded job while the parent keeps the plan, evidence, and approval state.',
    signals: ['Prompt presets', 'Model-aware routing', 'Bounded worker scopes'],
    to: '/prompt-presets-and-agents', link: 'Configure agents',
  },
  {
    number: '05', verb: 'Research', title: 'Answers that retain their receipts.',
    copy: 'Decompose a question, search across sources, challenge the first answer, and preserve source, date, freshness, and uncertainty with the result.',
    signals: ['Question decomposition', 'Source-aware synthesis', 'Freshness and uncertainty'],
    to: '/tools', link: 'Explore research tools',
  },
  {
    number: '06', verb: 'Enforce', title: 'A model cannot approve itself.',
    copy: 'Every proposed action crosses a separate Rust kernel. Safe work proceeds, consequential work waits, and hard boundaries remain blocked.',
    signals: ['Allow safe work', 'Ask before consequence', 'Block hard boundaries'],
    to: '/safety-model', link: 'Read the safety model',
  },
];

const boundaries = [
  ['Allow', 'Safe, in-scope work continues.'],
  ['Ask', 'Consequential work waits for your approval.'],
  ['Block', 'Hard boundaries do not move, even when the model asks.'],
];

function SectionIntro({label, title, copy}: {label: string; title: string; copy: string}) {
  return (
    <div className={styles.sectionIntro}>
      <div><p className={styles.eyebrow}>{label}</p><h2>{title}</h2></div>
      <p>{copy}</p>
    </div>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Local operator for work that has to finish"
      description="Vanta is an open-source local operator with an enforced Rust safety kernel, durable memory, automation, agents, and verified work receipts."
    >
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Open source / local first / kernel gated</p>
            <h1>Vanta</h1>
            <p className={styles.heroTitle}>A local operator for work that has to finish.</p>
            <p className={styles.heroCopy}>
              Vanta plans, uses tools, remembers context, and wakes for standing work. A separate Rust kernel checks every action before it runs.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} to="/quickstart">Install Vanta</Link>
              <Link className={styles.secondaryAction} to="/use-cases">Explore workflows</Link>
            </div>
            <div className={styles.installLine} aria-label="Terminal install command">
              <span aria-hidden="true">$</span>
              <code>curl -fsSL https://vanta.theft.studio/install.sh | bash</code>
            </div>
            <ul className={styles.heroFacts} aria-label="Vanta fundamentals">
              <li>Local state</li><li>Separate Rust kernel</li><li>Inspect every run</li>
            </ul>
          </div>
          <p className={styles.captureLabel}>Vanta operator / local by design</p>
        </header>

        <section className={styles.product} id="product" aria-labelledby="product-title">
          <div className={styles.inner}>
            <SectionIntro
              label="The operator surface"
              title="Give it the outcome. Keep the controls."
              copy="Sessions, approvals, tools, files, terminal output, and live artifacts stay visible in one working surface."
            />
            <figure className={styles.productFigure}>
              <img src="/img/vanta-desktop.png" alt="Vanta desktop showing sessions, operator chat, canvas, files, and terminal views" />
              <figcaption>Desktop operator surface. The terminal, TUI, and approved messaging channels use the same execution boundary.</figcaption>
            </figure>
          </div>
        </section>

        <section className={styles.liveDemo} aria-labelledby="demo-title">
          <div className={`${styles.inner} ${styles.demoGrid}`}>
            <div className={styles.demoCopy}>
              <p className={styles.eyebrow}>A real run</p>
              <h2 id="demo-title">Watch the work, not a montage.</h2>
              <p>This terminal capture shows Vanta taking an instruction through the actual operator loop. The recording is product evidence, not a concept render.</p>
            </div>
            <figure className={styles.demoFigure}>
              <video autoPlay muted loop playsInline controls preload="metadata" poster="/img/vanta-terminal-demo-poster.jpg" aria-label="Vanta executing a task in the terminal">
                <source src="/img/vanta-terminal-demo.mp4" type="video/mp4" />
              </video>
              <figcaption>Terminal operator loop / recorded product path</figcaption>
            </figure>
          </div>
        </section>

        <section className={styles.capabilities} aria-labelledby="capabilities-title">
          <div className={styles.inner}>
            <SectionIntro
              label="Six operating surfaces"
              title="One Vanta. A longer reach."
              copy="Each surface adds capability without replacing the execution contract underneath it."
            />
          </div>
          <ol className={styles.capabilityList}>
            {capabilities.map((capability, index) => (
              <li className={styles.capabilityBand} key={capability.number}>
                <div className={`${styles.inner} ${styles.capabilityInner} ${index % 2 ? styles.capabilityReverse : ''}`}>
                  <div className={styles.capabilityCopy}>
                    <p className={styles.eyebrow}>#{capability.number} / {capability.verb}</p>
                    <h3>{capability.title}</h3>
                    <p>{capability.copy}</p>
                    <Link className={styles.textLink} to={capability.to}>{capability.link} <span aria-hidden="true">-&gt;</span></Link>
                  </div>
                  <div className={styles.capabilityVisual} aria-hidden="true">
                    <p>{capability.verb.toUpperCase()} / OPERATOR SURFACE</p>
                    <ul>{capability.signals.map(signal => <li key={signal}><span />{signal}</li>)}</ul>
                    <strong>VNT-{capability.number}</strong>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.flow} aria-labelledby="flow-title">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>One execution contract</p>
            <h2 id="flow-title">Ask. Gate. Work. Verify.</h2>
            <ol className={styles.flowGrid}>
              {workflow.map(([number, title, copy]) => (
                <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className={styles.safety} id="safety" aria-labelledby="safety-title">
          <div className={styles.inner}>
            <div className={styles.safetyGrid}>
              <div>
                <p className={styles.eyebrow}>The structural difference</p>
                <h2 id="safety-title">Power without a blank check.</h2>
                <p className={styles.safetyCopy}>
                  The model does not grade its own safety. Vanta sends each proposed action to a separate, deterministic kernel before execution.
                </p>
                <Link className={styles.lightLink} to="/safety-model">Read the safety model <span aria-hidden="true">-&gt;</span></Link>
              </div>
              <ol className={styles.boundaryList}>
                {boundaries.map(([title, copy], index) => (
                  <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className={styles.proof} aria-labelledby="proof-title">
          <div className={styles.inner}>
            <SectionIntro
              label="Proof over promises"
              title="The roadmap says what is real."
              copy="Shipped work, active work, and external proof gates stay visible. Vanta does not turn a passing lower layer into a completion claim."
            />
            <div className={styles.proofActions}>
              <Link className={styles.primaryAction} to="/roadmap">Inspect the roadmap</Link>
              <Link className={styles.secondaryAction} to="/comparison">Compare Vanta</Link>
            </div>
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="install-title">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>Run it on your machine</p>
            <h2 id="install-title">Install Vanta. Give it one real task.</h2>
            <p>Start in the terminal, then add desktop, messaging, schedules, and agents when the work calls for them.</p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} to="/quickstart">Open quickstart</Link>
              <a className={styles.secondaryAction} href="https://github.com/jpoindexter/Vanta">View on GitHub</a>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
