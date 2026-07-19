import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// Explicit, grouped sidebar — order is intentional.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: ['intro', 'use-cases', 'why-vanta', 'quickstart', 'setup', 'configuration', 'examples'],
    },
    {
      type: 'category',
      label: 'Guides & tutorials',
      collapsed: false,
      items: ['guides/self-host', 'guides/automate-a-briefing', 'guides/extend-vanta'],
    },
    {
      type: 'category',
      label: 'How it works',
      collapsed: false,
      items: ['how-it-works', 'architecture', 'kernel', 'agent-loop', 'graph-engineering', 'safety-model', 'security', 'modularity', 'context-compression'],
    },
    {
      type: 'category',
      label: 'Capabilities',
      collapsed: false,
      items: [
        'tools',
        'providers',
        'skills-and-memory',
        'knowledge-and-refs',
        'commands',
        'autonomy',
        'prompt-presets-and-agents',
        'comms-and-gateway',
        'executive-function',
        'desktop-and-tui',
        'payment-transactions',
        'shopify-operations',
        'telephony-workflows',
      ],
    },
    {
      type: 'category',
      label: 'Operating Vanta',
      collapsed: false,
      items: [
        'operator-systems',
        'maintenance-health',
        'profiles',
        'self-improvement',
        'sessions-and-continuity',
        'modes-rooms-routing',
        'permissions-and-hooks',
        'settings',
      ],
    },
    {
      type: 'category',
      label: 'Extensibility',
      collapsed: false,
      items: ['mcp', 'plugins', 'integrations', 'extending'],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'reference/cli',
        'reference/environment',
        'reference/api',
        'reference/tools-list',
        'reference/commands-list',
      ],
    },
    'acceptance',
    'faq',
    'roadmap',
    'changelog',
  ],
};

export default sidebars;
