import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// Explicit sidebar — order is intentional (intro → quickstart → architecture).
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'quickstart',
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: ['architecture', 'safety-model'],
    },
  ],
};

export default sidebars;
