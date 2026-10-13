import { describe, expect, it } from 'vitest'

import { dialogOptionsFor, existingAbsolutePath, parseExternalUrl } from './paths-policy'

describe('parseExternalUrl', () => {
  it.each(['https://example.com/a?b=1', 'http://localhost:3000', 'mailto:jason@theft.studio'])('allows %s', raw => {
    expect(parseExternalUrl(raw)?.protocol).toMatch(/^(https?|mailto):$/)
  })

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'vanta://x',
    'ssh://host',
    'data:text/html,hi',
    '',
    'not a url',
    42,
    null,
    `https://x.test/${'a'.repeat(5000)}`
  ])('refuses %j', raw => {
    expect(parseExternalUrl(raw)).toBeNull()
  })
})

describe('existingAbsolutePath', () => {
  const probe = (directories: string[], files: string[] = []) => ({
    stat: async (target: string) => {
      if (directories.includes(target)) return { isDirectory: () => true }
      if (files.includes(target)) return { isDirectory: () => false }
      throw new Error('ENOENT')
    }
  })

  it('reports whether an existing absolute path is a directory', async () => {
    expect(await existingAbsolutePath('/work/project', probe(['/work/project']))).toEqual({
      isDirectory: true,
      path: '/work/project'
    })
    expect(await existingAbsolutePath('/work/a.txt', probe([], ['/work/a.txt']))).toEqual({
      isDirectory: false,
      path: '/work/a.txt'
    })
  })

  it('normalises traversal inside an absolute path', async () => {
    expect(await existingAbsolutePath('/work/project/../project', probe(['/work/project']))).toMatchObject({
      path: '/work/project'
    })
  })

  it.each(['relative/path', '../x', '~/x', '', '/with\0null', 7, undefined])('refuses %j', async raw => {
    expect(await existingAbsolutePath(raw, probe(['/x']))).toBeNull()
  })

  it('returns null for a path that does not exist', async () => {
    expect(await existingAbsolutePath('/nope', probe([]))).toBeNull()
  })
})

describe('dialogOptionsFor', () => {
  it('passes only the allowed dialog options', () => {
    expect(dialogOptionsFor({ properties: ['openDirectory', 'createDirectory'], title: 'Pick' })).toEqual({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Pick'
    })
  })

  it('falls back to a plain file picker when the renderer asks for anything else', () => {
    expect(dialogOptionsFor({ properties: ['showHiddenFiles'] })).toEqual({ properties: ['openFile'] })
    expect(dialogOptionsFor({ filters: [], properties: ['openFile'] })).toEqual({ properties: ['openFile'] })
    expect(dialogOptionsFor('nope')).toEqual({ properties: ['openFile'] })
  })
})
