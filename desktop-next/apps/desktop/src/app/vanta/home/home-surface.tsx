import { useStore } from '@nanostores/react'
import { useEffect, useMemo } from 'react'

import { $approvalRequests, answerApproval } from '@/store/prompts'
import { $gateway } from '@/store/gateway'
import { closeHome } from '@/store/home-view'
import { revealFile } from '@/store/file-actions'
import { refreshProjects } from '@/store/projects'
import { $gatewayState } from '@/store/session'
import { $sessionStates } from '@/store/session-states'
import type { GatewayRequester } from '@/app/contrib/types'

import { HomePage } from './home-page'
import { type HomeWiring, useHomeProps } from './use-home-props'
import { homeTaskActions } from './home-task-actions'
import type { HomeAttachmentHandoff } from './attachment-handoff'
import { useHomeDraft } from './use-home-draft'

interface HomeSurfaceProps {
  prepareAttachment: (request: HomeAttachmentHandoff) => Promise<void>
  openSession: (sessionId: string) => void
  requestGateway: GatewayRequester
  startTask: (text: string) => Promise<unknown>
}

const runtimeIdOf = (states: ReturnType<typeof $sessionStates.get>, storedId: string) =>
  Object.entries(states).find(([, state]) => state.storedSessionId === storedId)?.[0]

/** Home on live data: the supervision blocks, and a composer that starts a new chat. */
export function HomeSurface({ openSession, prepareAttachment, requestGateway, startTask }: HomeSurfaceProps) {
  const states = useStore($sessionStates)
  const approvals = useStore($approvalRequests)
  const gatewayState = useStore($gatewayState)
  const home = useHomeDraft()

  // The project chips read the project list, which needs an open gateway: ask once it is open instead of waiting for the
  // sidebar's project view (a first ask before the connection finishes is discarded).
  useEffect(() => {
    if (gatewayState === 'open') {
      void refreshProjects()
    }
  }, [gatewayState])

  const wiring = useMemo<HomeWiring>(() => {
    return {
      ...homeTaskActions({ prepareAttachment, startTask, capture: home.capture, scope: home.scope }),
      allowOnce: async storedId => {
        const runtimeId = runtimeIdOf(states, storedId)
        const request = runtimeId ? approvals[runtimeId] : undefined

        if (request) {
          await answerApproval($gateway.get(), request, 'once')
        }
      },
      openSession: id => {
        closeHome()
        openSession(id)
      },
      revealPath: path => void revealFile(path),
      stopRun: async storedId => {
        const runtimeId = runtimeIdOf(states, storedId)

        if (runtimeId) {
          await requestGateway('session.interrupt', { session_id: runtimeId })
        }
      }
    }
  }, [approvals, home.capture, home.scope, openSession, prepareAttachment, requestGateway, startTask, states])

  const props = useHomeProps(wiring)

  return (
    <div className="vp-scroll" data-testid="home-surface">
      <HomePage {...props} draft={home.control} key={home.key} />
    </div>
  )
}
