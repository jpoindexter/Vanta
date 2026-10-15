import { type FormEvent, type ReactElement, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { installSkillFromHub, type ProfileScope, previewSkillHub, scanSkillHub, searchSkillsHub } from '@/hermes'
import { Loader2 } from '@/lib/icons'
import { queryClient } from '@/lib/query-client'
import { notify, notifyError } from '@/store/notifications'
import type { SkillHubResult, SkillHubScanResult } from '@/types/hermes'

import { HUB_BROWSER_COPY as COPY, skillExcerpt } from './hub-browser-copy'
import { SKILLS_QUERY_KEY } from './skills-data'

interface SkillsHubBrowserProps {
  /** Names of skills already installed in the scoped profile. */
  installedNames: ReadonlySet<string>
  profile?: ProfileScope
}

interface PreviewState {
  excerpt: string
  files: string[]
  scan: SkillHubScanResult
}

function ResultPreview({ preview }: { preview: PreviewState }): ReactElement {
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs" data-testid="hub-preview">
      <p className="text-muted-foreground">
        {preview.scan.summary} {preview.files.length} file{preview.files.length === 1 ? '' : 's'}: {preview.files.join(', ')}
      </p>
      {preview.scan.findings.map(finding => (
        <p className="text-(--ui-text-warning,inherit)" key={finding.description}>
          {finding.severity}: {finding.description}
        </p>
      ))}
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono">{preview.excerpt}</pre>
    </div>
  )
}

function useHubRow(result: SkillHubResult, profile?: ProfileScope) {
  const [preview, setPreview] = useState<null | PreviewState>(null)
  const [busy, setBusy] = useState<'install' | 'preview' | null>(null)

  const togglePreview = async (): Promise<void> => {
    if (preview) return setPreview(null)
    setBusy('preview')

    try {
      const [scan, detail] = await Promise.all([scanSkillHub(result.identifier), previewSkillHub(result.identifier, profile)])
      setPreview({ excerpt: skillExcerpt(detail.skill_md), files: detail.files, scan })
    } catch (error) {
      notifyError(error, COPY.previewFailed)
    } finally {
      setBusy(null)
    }
  }

  const install = async (): Promise<void> => {
    setBusy('install')

    try {
      const done = await installSkillFromHub(result.identifier, profile)
      await queryClient.invalidateQueries({ queryKey: SKILLS_QUERY_KEY })
      notify({ kind: 'success', message: COPY.installedToast(done.name), title: COPY.title })
    } catch (error) {
      notifyError(error, COPY.installFailed)
    } finally {
      setBusy(null)
    }
  }

  return { busy, install, preview, togglePreview }
}

function HubRow({ installed, profile, result }: { installed: boolean; profile?: ProfileScope; result: SkillHubResult }): ReactElement {
  const { busy, install, preview, togglePreview } = useHubRow(result, profile)

  return (
    <li className="rounded-md border border-border/60 px-3 py-2" data-testid="hub-result">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{result.name}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{result.description}</p>
          <p className="mt-0.5 text-xs text-(--ui-text-quaternary)">{result.source}{result.repo ? ` · ${result.repo}` : ''}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button disabled={busy !== null} onClick={() => void togglePreview()} size="xs" variant="outline">
            {busy === 'preview' && <Loader2 className="size-3 animate-spin" />}
            {preview ? COPY.previewHide : COPY.preview}
          </Button>
          <Button disabled={installed || busy !== null} onClick={() => void install()} size="xs">
            {busy === 'install' && <Loader2 className="size-3 animate-spin" />}
            {installed ? COPY.installed : COPY.install}
          </Button>
        </div>
      </div>
      {busy === 'install' && <p className="mt-1.5 text-xs text-muted-foreground">{COPY.approveHint}</p>}
      {preview && <ResultPreview preview={preview} />}
    </li>
  )
}

/** Search skills.sh and GitHub lists from inside the Skills tab; installs wait on the usual approval. */
export function SkillsHubBrowser({ installedNames, profile }: SkillsHubBrowserProps): ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<null | SkillHubResult[]>(null)
  const [failed, setFailed] = useState<string[]>([])
  const [searching, setSearching] = useState(false)

  const search = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSearching(true)

    try {
      const found = await searchSkillsHub(query, 'all', 30)
      setResults(found.results)
      setFailed(found.timed_out)
    } catch (error) {
      notifyError(error, COPY.title)
    } finally {
      setSearching(false)
    }
  }

  return (
    <section className="grid gap-2 px-3 py-2" data-slot="skills-hub-browser">
      <h3 className="text-xs font-medium text-(--ui-text-tertiary)">{COPY.title}</h3>
      <form className="flex gap-2" onSubmit={event => void search(event)}>
        <Input aria-label={COPY.title} onChange={event => setQuery(event.target.value)} placeholder={COPY.placeholder} value={query} />
        <Button disabled={searching} type="submit" variant="outline">
          {searching ? COPY.searching : COPY.search}
        </Button>
      </form>
      {results === null && <p className="text-xs text-muted-foreground">{COPY.hint}</p>}
      {failed.length > 0 && <p className="text-xs text-muted-foreground">{COPY.sourceFailed(failed.join(', '))}</p>}
      {results?.length === 0 && <p className="text-xs text-muted-foreground">{COPY.empty}</p>}
      <ul className="grid max-h-[40vh] gap-2 overflow-y-auto">
        {results?.map(result => (
          <HubRow installed={installedNames.has(result.name)} key={result.identifier} profile={profile} result={result} />
        ))}
      </ul>
    </section>
  )
}
