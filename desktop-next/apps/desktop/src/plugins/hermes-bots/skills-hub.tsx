/**
 * Skills hub search for a bot: find a skill by name and install it through
 * skills.manage. There is no embedded hub page; Vanta loads nothing from a
 * hosted site here.
 *
 * A leaf: the advanced profile editor and the create dialog both mount it, and
 * it reaches back into neither.
 */

import { Button, Codicon, host, Input, useI18n } from '@hermes/plugin-sdk'
import { useState } from 'react'

import { useBots } from './i18n'
import { requestForBot } from './routing'
import type { RosterRow } from './types'

/** One `skills.manage action=search` hit. */
interface HubSkillResult {
  description?: string
  name: string
}
interface HubSkillsSectionProps {
  /** Existing bot to route through; omitted for the launch profile at create time. */
  bot?: RosterRow
  onInstalled?: (name: string) => void
}

export function HubSkillsSection({ bot, onInstalled }: HubSkillsSectionProps) {
  const b = useBots()
  const { t } = useI18n()
  const h = t.skills.hub
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HubSkillResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<null | string>(null)
  const [installed, setInstalled] = useState<Record<string, boolean>>({})

  const search = async () => {
    const q = query.trim()

    if (!q || searching) {
      return
    }

    setSearching(true)
    setResults(null)

    try {
      const res: { results?: HubSkillResult[] } = await host.request('skills.manage', {
        action: 'search',
        query: q
      })

      setResults(res.results || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const install = async (name: string, displayName?: string) => {
    const label = displayName || name

    if (installing) {
      return
    }

    setInstalling(label)

    try {
      // Existing bots must use their owner route; the active gateway is not
      // necessarily the gateway that owns the bot. Create-time installs stay
      // ambient because there is no bot row to route yet.
      const params = {
        action: 'install',
        query: name,
        ...(bot ? { profile: bot.name } : {})
      }

      await (bot ? requestForBot(bot, 'skills.manage', params) : host.request('skills.manage', params))
      setInstalled(prev => ({
        ...prev,
        [label]: true
      }))
      host.notify({
        kind: 'success',
        message: b.tools.installed(label)
      })

      if (typeof onInstalled === 'function') {
        onInstalled(label)
      }
    } catch (err) {
      host.notifyError(err, b.tools.installFailed(label))
    } finally {
      setInstalling(null)
    }
  }

  return (
    <div className="grid gap-1.5 border-t border-(--ui-stroke-secondary) pt-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[0.75rem] font-medium text-(--ui-text-secondary)">{b.tools.skillsHub}</div>
      </div>
      <div className="flex gap-1.5">
        <Input
          className="h-7 flex-1 text-xs"
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            // IME guard: Enter confirming a composed word must not search.
            if (event.nativeEvent?.isComposing || event.keyCode === 229) {
              return
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              void search()
            }
          }}
          placeholder={b.tools.searchHub}
          value={query}
        />
        <Button disabled={searching || !query.trim()} onClick={() => void search()} size="sm" variant="secondary">
          {searching ? h.searching : h.search}
        </Button>
      </div>
      {searching ? <div className="px-1 text-[0.75rem] text-(--ui-text-quaternary)">{b.tools.searchHint}</div> : null}
      {results === null ? null : results.length === 0 ? (
        <div className="px-1 py-1.5 text-[0.75rem] text-(--ui-text-quaternary)">{h.noResults}</div>
      ) : (
        <div
          className="overflow-y-auto overscroll-contain"
          style={{
            maxHeight: 150
          }}
        >
          <div className="grid gap-1">
            {results.map(r => (
              <div className="flex items-center gap-2 text-xs" key={r.name}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}</div>
                  {r.description ? (
                    <div className="truncate text-[0.75rem] text-(--ui-text-quaternary)">{r.description}</div>
                  ) : null}
                </div>
                {installed[r.name] ? (
                  <span className="flex shrink-0 items-center gap-0.5 text-[0.75rem] text-(--ui-text-tertiary)">
                    <Codicon name="check" size="0.65rem" />
                    {h.installed}
                  </span>
                ) : (
                  <Button
                    aria-label={b.tools.installHint(r.name)}
                    className="shrink-0 px-2 font-semibold"
                    disabled={installing !== null}
                    onClick={() => void install(r.name)}
                    size="sm"
                    variant="ghost"
                  >
                    {installing === r.name ? '…' : '+'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
