// Resolves `@vanta/shared` and its subpaths straight to apps/shared/src, from the package's own exports map.
// The workspace link in node_modules can point at another checkout, so nothing relies on it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function sharedAliases(sharedRoot = resolve(import.meta.dirname, '../../shared')) {
  const { exports } = JSON.parse(readFileSync(resolve(sharedRoot, 'package.json'), 'utf8'))
  const aliases = {}

  for (const [subpath, target] of Object.entries(exports)) {
    aliases[subpath === '.' ? '@vanta/shared' : `@vanta/shared/${subpath.slice(2)}`] = resolve(sharedRoot, target)
  }

  return aliases
}
