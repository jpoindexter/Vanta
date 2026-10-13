import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMPTY_CAPABILITY, EmptyState, STARTER_PROMPTS } from './empty-state'

afterEach(cleanup)

describe('EmptyState', () => {
  it('shows one heading, one capability line and four prompt chips', () => {
    render(<EmptyState onPick={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'What should Vanta do?' })).toBeTruthy()
    expect(screen.getByText(EMPTY_CAPABILITY)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('names each chip concretely, not by category', () => {
    render(<EmptyState onPick={vi.fn()} />)

    for (const label of ['Compare three CRM tools', 'Summarise my Downloads PDFs', 'Watch competitor pricing', 'Draft follow-ups']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('hands the full prompt, not the chip label, to the composer', () => {
    const onPick = vi.fn()

    render(<EmptyState onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Summarise my Downloads PDFs' }))

    expect(onPick).toHaveBeenCalledWith('Summarise the PDFs in my Downloads folder')
    expect(STARTER_PROMPTS.every(item => item.prompt.length > item.label.length)).toBe(true)
  })

  it('carries no wordmark or rotating copy', () => {
    const { container } = render(<EmptyState onPick={vi.fn()} />)

    expect(container.querySelector('.wordmark')).toBeNull()
    expect(container.textContent).not.toMatch(/hermes/i)
  })
})
