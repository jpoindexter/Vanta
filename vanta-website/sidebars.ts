import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// Explicit, grouped sidebar — order is intentional.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: ['intro', 'use-cases', 'quickstart', 'setup', 'configuration', 'examples'],
    },
    {
      type: 'category',
      label: 'How it works',
      collapsed: false,
      items: ['how-it-works', 'architecture', 'kernel', 'agent-loop', 'safety-model', 'security', 'modularity'],
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
        'comms-and-gateway',
        'executive-function',
        'desktop-and-tui',
      ],
    },
    {
      type: 'category',
      label: 'Operating Vanta',
      collapsed: false,
      items: [
        'operator-systems',
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
        'reference/tools-list',
        'reference/commands-list',
      ],
    },
    'roadmap',
  ],
};

export default sidebars;
