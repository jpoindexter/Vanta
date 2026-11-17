import { useStore } from '@nanostores/react'
import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { $homeAttachmentHandoff, homeAttachmentDraftKey, prepareHomeAttachmentDraft } from '@/app/vanta/home/attachment-handoff'
import { useComposerActions } from '@/app/chat/hooks/use-composer-actions'
import { AttachmentList } from '@/app/chat/composer/attachments'
import { requestComposerGetDraft } from '@/app/chat/composer/focus'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { $freshDraftKey } from '@/store/fresh-draft-scope'
import { $composerAttachments, stashSessionDraft, takeSessionDraft } from '@/store/composer'
import { $selectedStoredSessionId } from '@/store/session'
import { promptImages } from '@/lib/composer-images'
import { selectDesktopPaths, readDesktopFileDataUrlLocalFirst } from '@/lib/desktop-fs'
import { useHomeAttachmentHandoff } from './use-home-attachment-handoff'

vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
vi.mock('@/app/chat/composer/focus', async original => ({
  ...await original<Record<string, unknown>>(), requestComposerGetDraft: vi.fn()
}))
vi.mock('@/lib/desktop-fs', async original => ({
  ...await original<Record<string, unknown>>(),
  selectDesktopPaths: vi.fn(), readDesktopFileDataUrlLocalFirst: vi.fn()
}))
vi.mock('@/lib/image-resize', () => ({ downscaleDataUrlForPreview: vi.fn(async () => undefined) }))
const owner = { connectionId: 'local', profile: 'writer' }
const text = 'Keep the Home words'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+GkZcAAAAASUVORK5CYII='
const request = () => ({ id: crypto.randomUUID(), owner, text })
let acknowledge: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner)
  vi.mocked(requestComposerGetDraft).mockResolvedValue({ text })
  vi.mocked(selectDesktopPaths).mockResolvedValue(['/fixture/image.png'])
  vi.mocked(readDesktopFileDataUrlLocalFirst).mockResolvedValue('data:image/png;base64,' + png)
  acknowledge = vi.fn(async () => true)
  Object.assign(window, { vantaDesktop: { acknowledgePendingProjectTask: acknowledge } })
  $selectedStoredSessionId.set(null)
  $composerAttachments.set([])
})
afterEach(() => {
  cleanup()
  $homeAttachmentHandoff.set(null)
  $composerAttachments.set([])
  Reflect.deleteProperty(window, 'vantaDesktop')
})

function Chips() {
  return <AttachmentList attachments={useStore($composerAttachments)} />
}

function mount() {
  return renderHook(() => {
    const composer = useComposerActions({ activeSessionId: null, currentCwd: '/fixture', requestGateway: vi.fn() })
    return useHomeAttachmentHandoff({ startFresh: vi.fn(), pickAttachments: composer.pickAttachments })
  })
}

it('opens the existing picker only after the fresh draft claims its identity; exact PNG bytes reach send serialization', async () => {
  const oldImage = { id: 'old', kind: 'image' as const, label: 'old.png', imageData: { dataBase64: 'b2xk', mime: 'image/png' } }
  stashSessionDraft('previous-chat', 'Older private words', [oldImage], owner)
  const next = request()
  const { result } = mount()
  render(<Chips />)
  await act(() => result.current(next))
  await waitFor(() => expect(screen.getByText('image.png')).toBeDefined())
  expect(requestComposerGetDraft).toHaveBeenCalledWith([homeAttachmentDraftKey(next.id)])
  expect(acknowledge).toHaveBeenCalledWith(next.id)
  expect(selectDesktopPaths).toHaveBeenCalledOnce()
  expect(promptImages($composerAttachments.get())).toEqual([{ dataBase64: png, mime: 'image/png' }])
  expect(takeSessionDraft('previous-chat', owner)).toEqual({ text: 'Older private words', attachments: [oldImage] })
  expect(takeSessionDraft(homeAttachmentDraftKey(next.id), owner).text).toBe(text)
})

it('cancels the existing picker without sending, changing Home text or adopting an older image', async () => {
  vi.mocked(selectDesktopPaths).mockResolvedValue([])
  const next = request(), { result } = mount()
  await act(() => result.current(next))
  await waitFor(() => expect(selectDesktopPaths).toHaveBeenCalledOnce())
  expect($composerAttachments.get()).toEqual([])
  expect(takeSessionDraft(homeAttachmentDraftKey(next.id), owner).text).toBe(text)
  expect(readDesktopFileDataUrlLocalFirst).not.toHaveBeenCalled()
})

it('rejects an owner change before preparation without rotating or touching the old draft', () => {
  const previous = $freshDraftKey.get()
  vi.mocked(captureDraftCustodyOwner).mockReturnValue({ connectionId: 'local', profile: 'other' })
  expect(() => prepareHomeAttachmentDraft(request(), vi.fn())).toThrow('destination changed')
  expect($freshDraftKey.get()).toBe(previous)
  expect($homeAttachmentHandoff.get()).toBeNull()
})

it('does not read or attach picked bytes after profile movement while the chooser is open', async () => {
  let selected!: (paths: string[]) => void
  vi.mocked(selectDesktopPaths).mockImplementation(() => new Promise(resolve => { selected = resolve }))
  const next = request(), { result } = mount()
  await act(() => result.current(next))
  await waitFor(() => expect(selectDesktopPaths).toHaveBeenCalledOnce())
  vi.mocked(captureDraftCustodyOwner).mockReturnValue({ connectionId: 'local', profile: 'other' })
  await act(async () => selected(['/fixture/image.png']))
  expect($composerAttachments.get()).toEqual([])
  expect(readDesktopFileDataUrlLocalFirst).not.toHaveBeenCalled()
  expect(takeSessionDraft(homeAttachmentDraftKey(next.id), owner).text).toBe(text)
})

it('resumes the stable prepared key without overwriting later draft edits', () => {
  const next = request()
  prepareHomeAttachmentDraft(next, vi.fn())
  const key = homeAttachmentDraftKey(next.id)
  stashSessionDraft(key, 'Later edits survive reload', [], owner)
  prepareHomeAttachmentDraft(next, vi.fn())
  expect($freshDraftKey.get()).toBe(key)
  expect(takeSessionDraft(key, owner).text).toBe('Later edits survive reload')
})

it('waits for boot owner readiness before preparing a reloaded intent', async () => {
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(undefined)
  const next = request(), { result } = mount()
  let pending!: Promise<void>
  act(() => { pending = result.current(next) })
  expect($homeAttachmentHandoff.get()).toBeNull()
  expect(selectDesktopPaths).not.toHaveBeenCalled()
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner)
  await act(async () => pending)
  await waitFor(() => expect(selectDesktopPaths).toHaveBeenCalledOnce())
  expect($freshDraftKey.get()).toBe(homeAttachmentDraftKey(next.id))
})

it('uses the existing file context path for a non-image pick in the fresh draft', async () => {
  vi.mocked(selectDesktopPaths).mockResolvedValue(['/fixture/brief.pdf'])
  const next = request(), { result } = mount()
  await act(() => result.current(next))
  await waitFor(() => expect($composerAttachments.get()[0]?.label).toBe('brief.pdf'))
  expect($composerAttachments.get()[0]).toMatchObject({ kind: 'file', path: '/fixture/brief.pdf', refText: '@file:brief.pdf' })
  expect(promptImages($composerAttachments.get())).toBeUndefined()
})

it.each([false, true])('keeps one acknowledgement across callback replacement (StrictMode=%s)', async strict => {
  let finish!: (accepted: boolean) => void
  acknowledge.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(false)
  const first = vi.fn(async () => undefined), latest = vi.fn(async () => undefined), startFresh = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => strict ? <StrictMode>{children}</StrictMode> : children
  const { result, rerender } = renderHook(({ picker }) =>
    useHomeAttachmentHandoff({ startFresh, pickAttachments: picker }), { initialProps: { picker: first }, wrapper })
  await act(() => result.current(request()))
  await waitFor(() => expect(acknowledge).toHaveBeenCalledTimes(1))
  rerender({ picker: latest })
  await act(async () => finish(true))
  await waitFor(() => expect(latest).toHaveBeenCalledTimes(1), { timeout: 500 })
  expect(first).not.toHaveBeenCalled()
  expect(acknowledge).toHaveBeenCalledTimes(1)
})

it('marks the original image occurrence recoverably failed instead of reading another draft budget after a late read', async () => {
  let finish!: (data: string) => void
  vi.mocked(readDesktopFileDataUrlLocalFirst).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let current = true
  const scope = { add: vi.fn(), remove: vi.fn(), update: vi.fn(() => true),
    updateIfCurrent: vi.fn(() => true), list: vi.fn(() => []), target: 'main' }
  const { result } = renderHook(() => useComposerActions({
    activeSessionId: null, currentCwd: '/fixture', requestGateway: vi.fn(), scope
  }))
  let pending!: Promise<void>
  act(() => { pending = result.current.pickAttachments(() => current) })
  await waitFor(() => expect(scope.add).toHaveBeenCalledOnce())
  current = false
  await act(async () => { finish('data:image/png;base64,' + png); await pending })
  const original = scope.add.mock.calls[0][0]
  expect(scope.list).not.toHaveBeenCalled()
  expect(scope.updateIfCurrent).toHaveBeenCalledExactlyOnceWith(original, { uploadState: 'error' })
  expect(scope.remove).not.toHaveBeenCalled()
})
