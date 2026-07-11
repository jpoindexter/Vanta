import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Vanta',
  tagline: 'A local trusted operator — knows the goal before it picks a tool',
  favicon: 'img/favicon.ico',

  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Production URL — the custom domain served via Vercel (Cloudflare DNS-only).
  url: 'https://docs.vanta.theft.studio',
  baseUrl: '/',

  // GitHub deployment config — update org/repo if these differ.
  organizationName: 'theft-studio',
  projectName: 'vanta',

  // Warn (don't throw) on broken links so a missing page never fails the build
  // while the docs corpus is still being wired up.
  onBrokenLinks: 'warn',

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // docs ARE the site — root goes straight to them
        },
        blog: false, // docs site — no blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Vanta',
      items: [
        {to: '/docs', label: 'Docs', position: 'left'},
        {to: '/use-cases', label: 'Use cases', position: 'left'},
        {to: '/roadmap', label: 'Roadmap', position: 'left'},
        {
          href: 'https://github.com/theft-studio/vanta',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Introduction', to: '/docs'},
            {label: 'Quickstart', to: '/quickstart'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'GitHub', href: 'https://github.com/theft-studio/vanta'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Theft Studio. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
