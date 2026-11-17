import { describe, expect, it } from 'vitest'

import {
  normalizeVantaOpenString,
  pathFromVantaDeepLink,
  pathFromOpenDeepLink,
  resolveVantaOpenPath
} from './open-target'

describe('normalizeVantaOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeVantaOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeVantaOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped vanta:// deep links to the same path', () => {
    expect(normalizeVantaOpenString('vanta://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeVantaOpenString('vanta://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps vanta://open/… deep links by stripping the open host', () => {
    expect(normalizeVantaOpenString('vanta://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeVantaOpenString('vanta://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved vanta kinds and unsafe paths', () => {
    expect(normalizeVantaOpenString('vanta://blueprint/morning-brief')).toBeNull()
    expect(normalizeVantaOpenString('vanta://plugin/install')).toBeNull()
    expect(normalizeVantaOpenString('https://example.com/x')).toBeNull()
    expect(normalizeVantaOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeVantaOpenString('index-network')).toBeNull()
  })
})

describe('resolveVantaOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveVantaOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveVantaOpenPath({ href: 'vanta://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromVantaDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromVantaDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from vanta://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromVantaDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromVantaDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromVantaDeepLink('plugin', 'install')).toBeNull()
  })
})
