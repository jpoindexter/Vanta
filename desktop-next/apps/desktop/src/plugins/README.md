# Bundled plugins

Drop a `<name>/plugin.{ts,tsx}` here that default-exports a `VantaPlugin` and
it registers automatically at boot (vite glob in `../contrib/plugins.ts`), with
the same inventory + live enable/disable contract as runtime plugins.

Keep this tree for real shipped plugins (and the small authoring fixtures that
dogfood the SDK). One-off demos that rebuild a core chrome piece 1:1 do not
belong here — they double the UI and confuse Capabilities ▸ Plugins. Publish those
in the companion
[`vanta-example-plugins`](https://github.com/vanta/vanta-example-plugins)
repo instead.

User- and agent-authored plugins load at runtime from
`$VANTA_HOME/desktop-plugins/<name>/plugin.js` (the disk door) — see the
`vanta-desktop-plugins` skill.
