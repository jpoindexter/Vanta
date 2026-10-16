import { describe, expect, it } from 'vitest'

import { deriveRemoteAuthProviderShape } from './desktop-remote-auth'

describe('deriveRemoteAuthProviderShape', () => {
  it('uses fallback copy when the gateway has not reported providers', () => {
    expect(deriveRemoteAuthProviderShape(null).isPassword).toBe(false)
    expect(deriveRemoteAuthProviderShape([], 'the configured gateway')).toEqual({
      isPassword: false,
      providerLabel: 'the configured gateway'
    })
  })

  it('marks providers as password-style only when every provider supports password login', () => {
    expect(
      deriveRemoteAuthProviderShape([{ name: 'basic', displayName: 'Username & Password', supportsPassword: true }])
    ).toEqual({
      isPassword: true,
      providerLabel: 'Username & Password'
    })
  })

  it('keeps OAuth copy for redirect providers and mixed deployments', () => {
    expect(
      deriveRemoteAuthProviderShape([{ name: 'vanta', displayName: 'Theft Studio', supportsPassword: false }])
    ).toEqual({
      isPassword: false,
      providerLabel: 'Theft Studio'
    })

    expect(
      deriveRemoteAuthProviderShape([
        { name: 'basic', displayName: 'Username & Password', supportsPassword: true },
        { name: 'vanta', displayName: 'Theft Studio', supportsPassword: false }
      ])
    ).toEqual({
      isPassword: false,
      providerLabel: 'Username & Password / Theft Studio'
    })
  })

  it('falls back to provider names when display names are missing', () => {
    expect(deriveRemoteAuthProviderShape([{ name: 'basic', displayName: '', supportsPassword: true }])).toEqual({
      isPassword: true,
      providerLabel: 'basic'
    })
  })
})
