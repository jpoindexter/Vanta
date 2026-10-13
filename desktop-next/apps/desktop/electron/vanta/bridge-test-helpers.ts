import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import ts from 'typescript'
import { vi } from 'vitest'

import type { IpcRendererLike } from './bridge-core'

type Listener = (event: unknown, ...args: unknown[]) => void

export function fakeIpc(invokeResult: unknown = null) {
  const listeners = new Map<string, Set<Listener>>()
  const sent: unknown[][] = []
  const invoked: unknown[][] = []

  const ipc: IpcRendererLike = {
    invoke: (async (channel: string, ...args: unknown[]) => {
      invoked.push([channel, ...args])

      return typeof invokeResult === 'function'
        ? (invokeResult as (c: string, a: unknown[]) => unknown)(channel, args)
        : invokeResult
    }) as IpcRendererLike['invoke'],
    on: (channel, listener) => {
      listeners.set(channel, (listeners.get(channel) ?? new Set()).add(listener as Listener))
    },
    removeListener: (channel, listener) => {
      listeners.get(channel)?.delete(listener as Listener)
    },
    send: (channel, ...args) => {
      sent.push([channel, ...args])
    }
  }

  return {
    emit: (channel: string, ...args: unknown[]) => listeners.get(channel)?.forEach(l => l({}, ...args)),
    invoked,
    ipc,
    listenerCount: (channel: string) => listeners.get(channel)?.size ?? 0,
    sent
  }
}

export const env = (ipc: IpcRendererLike) => ({
  customWindowControls: false,
  ipc,
  pathForFile: (file: unknown) => `/dropped/${String(file)}`,
  zoom: { factor: () => 1.25, level: () => 1, set: vi.fn() }
})

// The Hermes members the OLD preload exposes, read from its source so the list cannot go stale.
export function legacyLeafNames(): string[] {
  const source = path.join(__dirname, '..', 'preload.ts')

  if (!existsSync(source)) {
    return []
  }

  const file = ts.createSourceFile(source, readFileSync(source, 'utf8'), ts.ScriptTarget.Latest, true)
  const names: string[] = []

  const walk = (object: ts.ObjectLiteralExpression, prefix: string) => {
    for (const property of object.properties) {
      const name = property.name?.getText().replace(/['"]/g, '')

      if (!name || !ts.isPropertyAssignment(property)) {
        continue
      }

      const member = prefix ? `${prefix}.${name}` : name
      ts.isObjectLiteralExpression(property.initializer) ? walk(property.initializer, member) : names.push(member)
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'contextBridge.exposeInMainWorld') {
      walk(node.arguments[1] as ts.ObjectLiteralExpression, '')
    }

    ts.forEachChild(node, visit)
  }

  visit(file)

  return names
}
