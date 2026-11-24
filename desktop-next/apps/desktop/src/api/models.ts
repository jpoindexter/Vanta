import type { ModelOptionsResult } from '@vanta/shared'

import type {
  AnalyticsResponse,
  AuxiliaryModelsResponse,
  MoaConfigResponse,
  ModelAssignmentRequest,
  ModelAssignmentResponse,
  ModelInfoResponse
} from '@/types/desktop'

import { capabilityScoped, vantaApi, rawApi, type ProfileScope, profileScoped, STARTUP_REQUEST_TIMEOUT_MS } from './client'

// /api/model/info resolves the live context window, which probes the configured
// provider's /models endpoint. An unreachable provider must not hold the Model
// Settings page hostage (the backend bounds the same probe; this is the client
// side of that budget).
const MODEL_INFO_REQUEST_TIMEOUT_MS = 5_000

export function getGlobalModelInfo(profile?: null | string): Promise<ModelInfoResponse> {
  return vantaApi<ModelInfoResponse>({
    ...profileScoped(profile),
    path: '/api/model/info',
    timeoutMs: MODEL_INFO_REQUEST_TIMEOUT_MS
  })
}

export function getUsageAnalytics(days = 30, profile?: ProfileScope): Promise<AnalyticsResponse> {
  return rawApi<AnalyticsResponse>({
    ...capabilityScoped(profile),
    path: `/api/analytics/usage?days=${Math.max(1, Math.floor(days))}`
  })
}

export function getGlobalModelOptions(
  opts?: {
    refresh?: boolean
    includeUnconfigured?: boolean
    explicitOnly?: boolean
  },
  profile?: ProfileScope
): Promise<ModelOptionsResult> {
  const params = new URLSearchParams()

  if (opts?.refresh) {
    params.set('refresh', '1')
  }

  if (opts?.includeUnconfigured) {
    params.set('include_unconfigured', '1')
  }

  if (opts?.explicitOnly !== false) {
    params.set('explicit_only', '1')
  }

  return rawApi<ModelOptionsResult>({
    ...capabilityScoped(profile),
    path: params.size > 0 ? `/api/model/options?${params.toString()}` : '/api/model/options',
    timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
  })
}

export interface RecommendedDefaultModel {
  provider: string
  model: string
  /** True/false for Vanta (free vs paid tier); null for other providers. */
  free_tier: boolean | null
}

// Recommended default model for a freshly-authenticated provider. Mirrors the
// curation `vanta model` does — for Vanta it honors the free/paid tier so a
// free user gets a free model instead of a paid default.
export function getRecommendedDefaultModel(provider: string, profile?: ProfileScope): Promise<RecommendedDefaultModel> {
  return rawApi<RecommendedDefaultModel>({
    ...capabilityScoped(profile),
    path: `/api/model/recommended-default?provider=${encodeURIComponent(provider)}`
  })
}

export function setGlobalModel(
  provider: string,
  model: string
): Promise<{ ok: boolean; provider: string; model: string }> {
  return vantaApi<{ ok: boolean; provider: string; model: string }>({
    ...profileScoped(),
    path: '/api/model/set',
    method: 'POST',
    body: {
      scope: 'main',
      provider,
      model
    }
  })
}

export function getAuxiliaryModels(profile?: null | string): Promise<AuxiliaryModelsResponse> {
  return vantaApi<AuxiliaryModelsResponse>({
    ...profileScoped(profile),
    path: '/api/model/auxiliary'
  })
}

export function getMoaModels(profile?: null | string): Promise<MoaConfigResponse> {
  return vantaApi<MoaConfigResponse>({
    ...profileScoped(profile),
    path: '/api/model/moa'
  })
}

export function saveMoaModels(
  body: MoaConfigResponse,
  profile?: null | string
): Promise<MoaConfigResponse & { ok: boolean }> {
  return vantaApi<MoaConfigResponse & { ok: boolean }>({
    ...profileScoped(profile),
    path: '/api/model/moa',
    method: 'PUT',
    body
  })
}

export function setModelAssignment(
  body: ModelAssignmentRequest,
  profile?: ProfileScope
): Promise<ModelAssignmentResponse> {
  return rawApi<ModelAssignmentResponse>({
    ...capabilityScoped(profile),
    path: '/api/model/set',
    method: 'POST',
    body
  })
}
