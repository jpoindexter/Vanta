import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { HermesApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

import { SkillsHubBrowser } from './skills-hub-browser'

const RESULT = { category: 'marketing', description: 'Audit pages', identifier: 'skills-sh:acme/skills/seo', integrity: 'content-hashed', name: 'seo', provenance: 'https://github.com/acme/skills/tree/main/seo', signature: 'unsigned', source: 'skills-sh' }

let calls: HermesApiRequest[]

beforeEach(() => {
  calls = []
  Object.defineProperty(window, 'vantaDesktop', { configurable: true, value: {} })
  installRestBridge(request => {
    calls.push(request)
    if (request.path === '/api/skills/hub-search') return { failures: [{ error: 'x', source: 'github' }], results: [RESULT] }
    if (request.path === '/api/skills/hub-preview') return { files: [{ bytes: 9, path: 'SKILL.md' }], identifier: RESULT.identifier, integrityOk: true, name: 'seo', risks: ['runs shell commands'], skillMd: '# SEO\nDo it.' }

    return { name: 'seo', ok: true, status: 'active' }
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'vantaDesktop')
  Reflect.deleteProperty(window, 'hermesDesktop')
})

async function searchFor(query: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Browse skills'), { target: { value: query } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await screen.findByTestId('hub-result')
}

describe('SkillsHubBrowser', () => {
  it('searches, shows results, and names a source that did not answer', async () => {
    render(<SkillsHubBrowser installedNames={new Set()} />)
    await searchFor('seo')

    expect(screen.getByText('Audit pages')).toBeTruthy()
    expect(screen.getByText(/did not answer: github/)).toBeTruthy()
    expect(calls.find(call => call.path === '/api/skills/hub-search')?.body).toMatchObject({ query: 'seo', source: 'all' })
  })

  it('previews the package with its risks before install', async () => {
    render(<SkillsHubBrowser installedNames={new Set()} />)
    await searchFor('seo')
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByText(/runs shell commands/)).toBeTruthy()
    expect(screen.getByTestId('hub-preview').textContent).toContain('Do it.')
  })

  it('installs through the hub route and disables rows already installed', async () => {
    const { rerender } = render(<SkillsHubBrowser installedNames={new Set()} />)
    await searchFor('seo')
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(calls.some(call => call.path === '/api/skills/hub-install')).toBe(true))

    rerender(<SkillsHubBrowser installedNames={new Set(['seo'])} />)
    expect((screen.getByRole('button', { name: 'Installed' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
