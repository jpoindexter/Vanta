import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// Explicit, grouped sidebar — order is intentional.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: ['intro', 'quickstart', 'configuration'],
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: ['architecture', 'kernel', 'agent-loop', 'safety-model'],
    },
    {
      type: 'category',
      label: 'Capabilities',
      collapsed: false,
      items: ['tools', 'providers', 'skills-and-memory', 'commands'],
    },
    {
      type: 'category',
      label: 'Going further',
      collapsed: false,
      items: ['operator-systems', 'extending'],
    },
  ],
};

export default sidebars;
