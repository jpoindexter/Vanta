#!/usr/bin/env node
// cc-gap-analysis.mjs
// Finds Claude Code source features not yet captured in roadmap.json.
// Run: node vanta-ts/scripts/cc-gap-analysis.mjs
//
// Output: three sections — feature flags, commands, tools — each listing
// uncovered items with source location and a one-line context snippet.
// Items that are Anthropic-internal (isEnabled:false, USER_TYPE=ant, etc.)
// are tagged "(internal)" and omitted from the gap count.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const refSrc = join(repoRoot, 'reference', 'claude-code-source', 'src')
const roadmapPath = join(repoRoot, 'roadmap.json')

// ── utilities ─────────────────────────────────────────────────────────────────

function read(path) {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}

function ls(dir) {
  try { return readdirSync(dir) } catch { return [] }
}

function isDir(path) {
  try { return statSync(path).isDirectory() } catch { return false }
}

function rel(path) {
  return path.replace(repoRoot + '/', '')
}

// ── roadmap coverage index ────────────────────────────────────────────────────

const roadmap = JSON.parse(read(roadmapPath))
const allCards = roadmap.items

// Per-card: lowercased blob of all text fields
const cardBlobs = allCards.map(c =>
  [c.id, c.title, c.notes ?? '', c.summary ?? '', c.done ?? '']
    .join(' ').toLowerCase()
)

// Return the matching card ID, or null
function findCoverage(tokens) {
  for (let i = 0; i < cardBlobs.length; i++) {
    const blob = cardBlobs[i]
    // All tokens must appear as substrings in the same card
    if (tokens.every(tok => blob.includes(tok))) {
      return allCards[i].id
    }
  }
  return null
}

// Generate lookup tokens for a feature flag name like BASH_CLASSIFIER
function flagTokens(flag) {
  // Strategy: try progressively shorter prefix sets to avoid false negatives
  const parts = flag.toLowerCase().split('_').filter(p => p.length > 1)
  const dashed = parts.join('-')          // bash-classifier
  const id = 'cc-' + dashed              // cc-bash-classifier

  return [
    [id],                                 // exact id match
    [dashed],                             // dashed in any text
    parts,                                // all parts (e.g. 'bash' + 'classifier')
    parts.map(p => p.slice(0, 5)),        // truncated parts — catches 'cached' vs 'cache'
  ]
}

function isCoveredFlag(flag) {
  for (const tokens of flagTokens(flag)) {
    if (tokens.length > 0 && findCoverage(tokens)) return true
  }
  return false
}

// For a command name like 'btw' or 'rate-limit-options'
function isCoveredCommand(name) {
  const parts = name.toLowerCase().replace(/-/g, ' ').split(' ').filter(p => p.length > 2)
  if (parts.length === 0) return true
  if (parts.length === 1) return cardBlobs.some(b => b.includes(parts[0]))
  return !!findCoverage(parts)
}

// For a tool directory name like 'BashTool' or 'ReviewArtifactTool'
function isCoveredTool(dirName) {
  // Strip trailing 'Tool'
  const base = dirName.replace(/Tool$/, '')
  // Split CamelCase into words
  const words = base.split(/(?=[A-Z])/).map(w => w.toLowerCase()).filter(w => w.length > 2)
  if (words.length === 0) return true
  return !!findCoverage(words)
}

// ── internal-only detection ───────────────────────────────────────────────────

const INTERNAL_MARKERS = [
  "isEnabled: () => false",
  "isEnabled:()=>false",
  "USER_TYPE === 'ant'",
  '"external" === \'ant\'',
  "process.env.USER_TYPE",
]

function isInternal(text) {
  return INTERNAL_MARKERS.some(m => text.includes(m))
}

// ── sweep 1: feature flags ────────────────────────────────────────────────────

function sweepFlags() {
  const flags = new Map() // flag → { firstFile, firstLine, ctx, allInternal }

  function scanDir(dir) {
    for (const entry of ls(dir)) {
      const full = join(dir, entry)
      if (isDir(full)) {
        if (entry !== 'node_modules' && !entry.startsWith('.')) scanDir(full)
        continue
      }
      if (!full.endsWith('.ts') && !full.endsWith('.tsx')) continue

      const text = read(full)
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        const m = line.match(/feature\('([A-Z_]{3,})'\)/)
        if (!m) return
        const flag = m[1]
        const ctx = line.trim().slice(0, 120)
        const internal = isInternal(text)
        if (!flags.has(flag)) {
          flags.set(flag, { firstFile: full, firstLine: i + 1, ctx, allInternal: internal })
        } else {
          // If ANY occurrence is non-internal, the flag is not all-internal
          if (!internal) flags.get(flag).allInternal = false
        }
      })
    }
  }

  scanDir(refSrc)
  return flags
}

// ── sweep 2: commands ─────────────────────────────────────────────────────────

const SKIP_CMD = new Set(['createMovedToPluginCommand'])

function sweepCommands() {
  const cmdsDir = join(refSrc, 'commands')
  const results = []

  for (const entry of ls(cmdsDir)) {
    const full = join(cmdsDir, entry)
    const isDirectory = isDir(full)

    let name, description, text

    if (!isDirectory) {
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue
      name = entry.replace(/\.(tsx?)$/, '')
      text = read(full)
    } else {
      name = entry
      text = read(join(full, 'index.ts')) || read(join(full, 'index.js'))
    }

    if (!text || SKIP_CMD.has(name)) continue

    const dm = text.match(/description:\s*['"`]([^'"`\n]{5,})/)
    description = dm ? dm[1].slice(0, 80) : ''
    const internal = isInternal(text)

    results.push({ name, description, internal, path: full })
  }

  return results
}

// ── sweep 3: tools ────────────────────────────────────────────────────────────

const SKIP_TOOL_DIRS = new Set(['shared', 'testing'])

function sweepTools() {
  const toolsDir = join(refSrc, 'tools')
  const results = []

  for (const entry of ls(toolsDir)) {
    if (SKIP_TOOL_DIRS.has(entry)) continue
    const full = join(toolsDir, entry)
    if (!isDir(full)) continue

    const mainTs = join(full, entry + '.ts')
    const text = read(mainTs)
    const dm = text.match(/description:\s*['"`]([^'"`\n]{10,})/m)
    const description = dm ? dm[1].slice(0, 80) : ''
    const internal = isInternal(text)

    results.push({ name: entry, description, internal, path: full })
  }

  return results
}

// ── run sweeps ────────────────────────────────────────────────────────────────

const flagMap = sweepFlags()
const commands = sweepCommands()
const tools = sweepTools()

// Partition flags
const uncoveredFlags = []
const internalFlags = []
for (const [flag, info] of flagMap) {
  if (info.allInternal) { internalFlags.push(flag); continue }
  if (isCoveredFlag(flag)) continue
  uncoveredFlags.push({ flag, ...info })
}
uncoveredFlags.sort((a, b) => a.flag.localeCompare(b.flag))

// Partition commands
const uncoveredCmds = []
const internalCmds = []
for (const cmd of commands) {
  if (cmd.internal) { internalCmds.push(cmd.name); continue }
  if (isCoveredCommand(cmd.name)) continue
  uncoveredCmds.push(cmd)
}

// Partition tools
const uncoveredTools = []
for (const tool of tools) {
  if (tool.internal) continue
  if (isCoveredTool(tool.name)) continue
  uncoveredTools.push(tool)
}

// ── render ────────────────────────────────────────────────────────────────────

const totalCC = allCards.filter(c => c.track === 'Claude Code parity').length
const totalGaps = uncoveredFlags.length + uncoveredCmds.length + uncoveredTools.length

console.log()
console.log('╔══════════════════════════════════════════════════════════════╗')
console.log('║  CC GAP ANALYSIS  ·  ' + new Date().toISOString().slice(0, 10) + '                       ║')
console.log('╚══════════════════════════════════════════════════════════════╝')
console.log()
console.log(`  Roadmap : ${allCards.length} cards total  ·  ${totalCC} CC parity`)
console.log(`  Source  : ${flagMap.size} flags (${internalFlags.length} internal)  ·  ${commands.length} commands (${internalCmds.length} internal)  ·  ${tools.length} tool dirs`)
console.log(`  Gaps    : ${totalGaps} uncovered  (${uncoveredFlags.length} flags · ${uncoveredCmds.length} commands · ${uncoveredTools.length} tools)`)
console.log()

if (uncoveredFlags.length === 0) {
  console.log('  ✓ No uncovered feature flags\n')
} else {
  console.log(`━━  FEATURE FLAGS  ·  ${uncoveredFlags.length} uncovered  ${'─'.repeat(35)}`)
  for (const { flag, firstFile, firstLine, ctx } of uncoveredFlags) {
    const loc = `${rel(firstFile)}:${firstLine}`
    console.log()
    console.log(`  ${flag}`)
    console.log(`    ${loc}`)
    console.log(`    ${ctx.slice(0, 110)}`)
  }
  console.log()
}

if (uncoveredCmds.length === 0) {
  console.log('  ✓ No uncovered commands\n')
} else {
  console.log(`━━  COMMANDS  ·  ${uncoveredCmds.length} uncovered  ${'─'.repeat(40)}`)
  for (const { name, description } of uncoveredCmds) {
    const desc = description || '(no description)'
    console.log(`  /${name.padEnd(28)} ${desc}`)
  }
  console.log()
}

if (uncoveredTools.length === 0) {
  console.log('  ✓ No uncovered tools\n')
} else {
  console.log(`━━  TOOLS  ·  ${uncoveredTools.length} uncovered  ${'─'.repeat(43)}`)
  for (const { name, description } of uncoveredTools) {
    const desc = description || '(no description)'
    console.log(`  ${name.padEnd(30)} ${desc}`)
  }
  console.log()
}

if (internalFlags.length > 0 || internalCmds.length > 0) {
  console.log(`─  skipped (internal/disabled): ${internalFlags.length} flags · ${internalCmds.length} commands  ─`)
  console.log()
}
