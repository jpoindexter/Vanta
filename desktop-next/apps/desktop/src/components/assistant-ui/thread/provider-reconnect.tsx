import { useAui, useAuiState } from '@assistant-ui/react'
import { useStore } from '@nanostores/react'
import { type FC, type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getEnvVars, setEnvVar } from '@/desktop-api'
import { useI18n } from '@/i18n'
import type { ErrorSurface } from '@/lib/error-surface'
import { KeyRound } from '@/lib/icons'
import { reconnectProviderAndResume } from '@/lib/provider-auth-recovery'
import { queryClient } from '@/lib/query-client'
import { $currentModel } from '@/store/session'

interface ProviderReconnectProps {
  model: string
  /** Resume the stopped request once the new key is saved (the card's own Retry). */
  onResume: () => Promise<void> | void
  provider: string
  providerLabel: string
}

/** The variable the provider's key is saved under, found from the provider list; null for a keyless provider. */
async function keyVariableFor(provider: string): Promise<null | string> {
  const vars = await getEnvVars()

  return Object.entries(vars).find(([, info]) => info.provider === provider)?.[0] ?? null
}

/** Save the key through the Providers road: one request to the server, nothing kept here. */
async function saveKey(envKey: string, key: string): Promise<void> {
  await setEnvVar(envKey, key, undefined, { providerSetup: true })
  void queryClient.invalidateQueries({ queryKey: ['model-options'] })
}

interface ReconnectForm {
  apiKey: string
  busy: boolean
  envKey: null | string | undefined
  error: null | string
  inputRef: RefObject<HTMLInputElement | null>
  keyless: boolean
  reset: () => void
  setApiKey: (value: string) => void
  submit: (event: FormEvent) => Promise<void>
}

/** `undefined` while the provider list loads, `null` for a provider with no key, else the variable name. */
function useKeyVariable(provider: string, open: boolean): null | string | undefined {
  const [envKey, setEnvKey] = useState<null | string | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    keyVariableFor(provider)
      .then(name => !cancelled && setEnvKey(name))
      .catch(() => !cancelled && setEnvKey(null))

    return () => void (cancelled = true)
  }, [open, provider])

  return envKey
}

/** Save the new key, then resume. A failed save leaves the dialog open with the server's reason. */
async function reconnect(props: ProviderReconnectProps, envKey: null | string, apiKey: string): Promise<void> {
  const save = async (_provider: string, _model: string, key: string) => (envKey ? saveKey(envKey, key) : undefined)

  await reconnectProviderAndResume(save, props.onResume, { apiKey, model: props.model, provider: props.provider, resume: true })
}

/** The key lives in this hook's state only and is cleared by `reset` (cancel, close, success). */
function useReconnectForm(props: ProviderReconnectProps, open: boolean, close: () => void): ReconnectForm {
  const copy = useI18n().t.vantaShell.reconnect
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const envKey = useKeyVariable(props.provider, open)
  const keyless = envKey === null

  const reset = useCallback(() => {
    setApiKey('')
    setError(null)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = apiKey.trim()

    if (busy || envKey === undefined) {
      return
    }

    if (!keyless && !value) {
      setError(copy.missingKey)
      inputRef.current?.focus()

      return
    }

    setBusy(true)
    setError(null)

    try {
      await reconnect(props, envKey, value)
      reset()
      close()
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : copy.failed)
    } finally {
      setBusy(false)
    }
  }

  return { apiKey, busy, envKey, error, inputRef, keyless, reset, setApiKey, submit }
}

const KeyField: FC<{ form: ReconnectForm }> = ({ form }) => {
  const copy = useI18n().t.vantaShell.reconnect

  return (
    <label className="grid gap-1.5 text-xs">
      <span className="font-medium">{copy.keyLabel}</span>
      <Input
        autoComplete="off"
        autoFocus
        disabled={form.busy || form.envKey === undefined}
        name="provider-key"
        onChange={event => form.setApiKey(event.target.value)}
        ref={form.inputRef}
        spellCheck={false}
        type="password"
        value={form.apiKey}
      />
      {form.envKey && <span className="text-muted-foreground">{copy.keyEnvHint(form.envKey)}</span>}
    </label>
  )
}

const DialogBody: FC<{ close: () => void; form: ReconnectForm; providerLabel: string }> = ({ close, form, providerLabel }) => {
  const copy = useI18n().t.vantaShell.reconnect

  return (
    <form className="grid gap-4" onSubmit={event => void form.submit(event)}>
      <DialogHeader>
        <DialogTitle>{copy.title(providerLabel)}</DialogTitle>
        <DialogDescription>{form.keyless ? copy.keylessBody(providerLabel) : copy.body}</DialogDescription>
      </DialogHeader>
      {!form.keyless && <KeyField form={form} />}
      {form.error && (
        <p className="text-xs text-destructive" role="alert">
          {form.error}
        </p>
      )}
      <DialogFooter>
        <Button disabled={form.busy} onClick={close} type="button" variant="ghost">
          {copy.cancel}
        </Button>
        <Button disabled={form.busy || form.envKey === undefined} type="submit">
          {form.busy ? copy.busy : form.keyless ? copy.resume : copy.confirm}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * The error card's "Reconnect model": asks for a new key for the provider that refused the saved one,
 * saves it, then resumes the stopped request. The key is never shown, logged or stored by this component.
 */
export const ProviderReconnectAction: FC<ProviderReconnectProps> = props => {
  const copy = useI18n().t.vantaShell.reconnect
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const form = useReconnectForm(props, open, close)

  // Closing always forgets what was typed; a request in flight is left to finish first.
  const dismiss = useCallback(() => {
    if (!form.busy) {
      form.reset()
      close()
    }
  }, [close, form])

  return (
    <>
      <button className="aui-error-action" data-tone="primary" onClick={() => setOpen(true)} type="button">
        <KeyRound className="size-3" />
        {copy.action}
      </button>
      <Dialog onOpenChange={next => !next && dismiss()} open={open}>
        <DialogContent className="max-w-md" data-testid="provider-reconnect">
          <DialogBody close={dismiss} form={form} providerLabel={props.providerLabel} />
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * The reconnect action as the error card mounts it: for the newest message only (an older failure's request
 * is no longer the one to resume), resuming through the same reload the card's Retry button runs.
 */
export const ErrorCardReconnect: FC<{ surface: ErrorSurface }> = ({ surface }) => {
  const { t } = useI18n()
  const aui = useAui()
  const isLast = useAuiState(s => s.message.isLast)
  const currentModel = useStore($currentModel)

  if (!isLast) {
    return null
  }

  return (
    <ProviderReconnectAction
      model={surface.model ?? currentModel ?? ''}
      onResume={() => aui.message().reload()}
      provider={surface.provider ?? ''}
      providerLabel={surface.providerLabel || surface.provider || t.assistant.thread.errorGenericProvider}
    />
  )
}
