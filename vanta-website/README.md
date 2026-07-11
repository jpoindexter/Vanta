# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
npm ci
```

## Local Development

```bash
npm start
```

This command regenerates the roadmap and starts the local Docusaurus server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

```bash
npm run deploy
```

This builds and uploads `build/` to the Cloudflare Pages project `vanta-docs` on the
production branch. The custom domain is [docs.vanta.theft.studio](https://docs.vanta.theft.studio).
Pushing changes under `vanta-website/` also triggers `.github/workflows/deploy-docs.yml`
when the repository has `CLOUDFLARE_API_TOKEN` configured.
