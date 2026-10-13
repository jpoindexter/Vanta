import { atom } from 'nanostores'
import { useEffect, useMemo } from 'react'

import { ChatRuntimeBoundary } from '@/app/chat'
import { ChatBar } from '@/app/chat/composer'
import { FloatingComposerSurface } from '@/app/chat/composer/floating-surface'
import { ComposerSurfaceProvider } from '@/app/chat/composer/scope'
import type { ChatBarState } from '@/app/chat/composer/types'
import { PRIMARY_SESSION_VIEW, SessionViewProvider } from '@/app/chat/session-view'
import { Thread } from '@/components/assistant-ui/thread'
import { PaneGroupContext } from '@/components/pane-shell/pane-visibility'
import { $gatewayState } from '@/store/session'

import { fixtureMessages } from './fixtures'
import { type FixtureParams, MAIN_HEIGHT, MAIN_WIDTH } from './params'
import { seedClarify, seedPrompts } from './prompts'

const SESSION_ID = 'fixture-session'

const CHAT_BAR_STATE: ChatBarState = {
  model: {
    canSwitch: true,
    model: 'Sonnet 5.5',
    provider: 'vanta',
    reasoningMenuContent: <div className="p-2 text-xs">Effort</div>,
    supportsReasoning: true
  },
  tools: { enabled: true, label: 'Attach' },
  voice: { enabled: true, active: false }
}

const noop = () => undefined
const noopAsync = async () => true

export function FixtureScene({ params }: { params: FixtureParams }) {
  const messages = useMemo(() => fixtureMessages(params), [params])
  const busy = params.state === 'running'

  const view = useMemo(
    () => ({
      ...PRIMARY_SESSION_VIEW,
      $messages: atom(messages),
      $busy: atom(busy),
      $cwd: atom('/work/Vanta'),
      $messagesEmpty: atom(messages.length === 0),
      $runtimeId: atom<string | null>(SESSION_ID),
      $storedId: atom<string | null>(SESSION_ID)
    }),
    [busy, messages]
  )

  useEffect(() => {
    $gatewayState.set('open')
    seedPrompts(params, SESSION_ID)
    seedClarify(params, SESSION_ID)
  }, [params])

  return (
    <div
      data-fixture-main=""
      style={{ height: MAIN_HEIGHT, margin: 0, overflow: 'hidden', position: 'relative', width: MAIN_WIDTH[params.width] }}
    >
      <SessionViewProvider value={view}>
        <ChatRuntimeBoundary
          busy={busy}
          onCancel={noop}
          onEdit={async () => undefined}
          onReload={async () => undefined}
          onThreadMessagesChange={noop}
          suppressMessages={false}
        >
          <div
            className="relative isolate flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)"
            data-chat-surface=""
          >
            <div
              className="relative min-h-0 max-w-full flex-1 overflow-hidden bg-(--ui-chat-surface-background) contain-[layout_paint]"
              data-slot="composer-bounds"
            >
              <Thread
                clampToComposer
                intro={params.state === 'empty' ? {} : undefined}
                sessionId={SESSION_ID}
                sessionKey={SESSION_ID}
              />
            </div>
            <ComposerSurfaceProvider value="fixture-surface">
              <PaneGroupContext.Provider value="fixture-group">
                <FloatingComposerSurface>
                  <ChatBar
                    busy={busy}
                    disabled={false}
                    gateway={null}
                    onCancel={noop}
                    onSubmit={noopAsync}
                    sessionId={SESSION_ID}
                    state={CHAT_BAR_STATE}
                  />
                </FloatingComposerSurface>
              </PaneGroupContext.Provider>
            </ComposerSurfaceProvider>
          </div>
        </ChatRuntimeBoundary>
      </SessionViewProvider>
    </div>
  )
}
