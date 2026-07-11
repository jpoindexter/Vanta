import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

type Capability = {
  number: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  accent: 'focus' | 'health' | 'activity' | 'goal' | 'risk' | 'neutral';
};

const capabilities: Capability[] = [
  {
    number: '01',
    eyebrow: 'Reach',
    title: 'Work from wherever you are',
    description: <>Use the terminal, desktop app, or an approved messaging channel. The same kernel boundary follows the task.</>,
    accent: 'focus',
  },
  {
    number: '02',
    eyebrow: 'Remember',
    title: 'Keep the useful context',
    description: <>Recall decisions, project facts, and learned workflows across sessions without replaying the whole conversation.</>,
    accent: 'health',
  },
  {
    number: '03',
    eyebrow: 'Automate',
    title: 'Wake up for standing work',
    description: <>Run scheduled briefs, watchers, and goal sentinels with explicit rules for what runs alone and what waits.</>,
    accent: 'activity',
  },
  {
    number: '04',
    eyebrow: 'Delegate',
    title: 'Use a team without losing control',
    description: <>Fan work into isolated agents, preserve their receipts, and keep risky actions behind the same approval gate.</>,
    accent: 'goal',
  },
  {
    number: '05',
    eyebrow: 'Research',
    title: 'Build answers from evidence',
    description: <>Search, read, compare, and challenge sources. Durable research keeps source, date, freshness, and uncertainty attached.</>,
    accent: 'neutral',
  },
  {
    number: '06',
    eyebrow: 'Verify',
    title: 'Report what actually ran',
    description: <>Tests, artifacts, and delivery receipts close the loop. A plausible code path is not presented as completed work.</>,
    accent: 'risk',
  },
];

function CapabilityItem({capability}: {capability: Capability}) {
  return (
    <article className={clsx(styles.capability, styles[capability.accent])}>
      <div className={styles.capabilityMeta}>
        <span>{capability.number}</span>
        <span>{capability.eyebrow}</span>
      </div>
      <h3>{capability.title}</h3>
      <p>{capability.description}</p>
    </article>
  );
}
export default function Home(): ReactNode {
  return (
    <Layout
      title="Local trusted operator"
      description="Vanta is a local operator agent with an enforced Rust safety kernel, durable memory, automation, and verified work receipts."
    >
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroScrim} aria-hidden="true" />
          <div className={styles.heroContent}>
            <p className={styles.kicker}>Open source. Local first. Kernel gated.</p>
            <h1>Vanta</h1>
            <p className={styles.lede}>
              A trusted operator that knows the goal, checks every action through a separate safety kernel, and reports only what it verified.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} to="/quickstart">Install Vanta</Link>
              <Link className={styles.secondaryAction} to="/use-cases">See what it can do</Link>
            </div>
            <div className={styles.installLine} aria-label="Terminal install command">
              <span aria-hidden="true">$</span>
              <code>curl -fsSL https://docs.vanta.theft.studio/install.sh | bash</code>
            </div>
          </div>
          <p className={styles.captureLabel}>Current Vanta desktop operator surface</p>
        </header>

        <section className={styles.thesis} aria-labelledby="thesis-title">
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>The structural difference</p>
            <h2 id="thesis-title">The agent does not grade its own safety.</h2>
            <div className={styles.thesisGrid}>
              <p>
                Vanta splits execution into two layers. The TypeScript agent plans and uses tools. A small Rust kernel independently classifies each action as allow, ask, or block before it runs.
              </p>
              <ol>
                <li><strong>Goal aware.</strong> The task stays attached to the reason it exists.</li>
                <li><strong>Boundary enforced.</strong> Scope and risk are checked outside the model loop.</li>
                <li><strong>Evidence closed.</strong> Completion requires an executed verifier or an explicit gap.</li>
              </ol>
            </div>
            <Link className={styles.textLink} to="/safety-model">Read the safety model <span aria-hidden="true">-&gt;</span></Link>
          </div>
        </section>

        <section className={styles.capabilitiesSection} aria-labelledby="capabilities-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionLabel}>One operator, real workflows</p>
                <h2 id="capabilities-title">Start with the outcome.</h2>
              </div>
              <p>Vanta combines local tools, memory, channels, schedules, and agents behind one inspectable boundary.</p>
            </div>
            <div className={styles.capabilityGrid}>
              {capabilities.map((capability) => <CapabilityItem key={capability.number} capability={capability} />)}
            </div>
          </div>
        </section>

        <section className={styles.proof} aria-labelledby="proof-title">
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>Proof over promises</p>
            <h2 id="proof-title">Inspect the work, not the pitch.</h2>
            <p className={styles.proofCopy}>
              The public roadmap names what is shipped, building, externally blocked, and still only an idea. Use-case evaluations are being expanded from tool-route checks into complete community-job receipts.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} to="/roadmap">Open the roadmap</Link>
              <Link className={styles.secondaryAction} to="/docs">Read the docs</Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
