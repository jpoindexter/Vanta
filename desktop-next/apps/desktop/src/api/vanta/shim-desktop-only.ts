import type { AnalyticsResponse, ElevenLabsVoicesResponse, TerminalBackendsResponse, ToolsetConfig } from '@/types/desktop'

import { segment, type ShimRoute, text } from './shim-core'

const DEFAULT_PERIOD_DAYS = 30

/**
 * Vanta pages that read services Vanta does not run (provider catalogs per tool, hosted voices,
 * usage analytics, terminal backends). Each answers with an honest "nothing here" so the page shows its
 * empty state instead of a 404 toast. Reads only; a write to any of these still reaches the server and fails loudly.
 */
export const vantaOnlyRoutes: readonly ShimRoute[] = [
  {
    // Vanta tools have no per-tool provider to choose.
    handle: async (call): Promise<ToolsetConfig> => ({
      active_provider: null,
      has_category: false,
      name: segment(call),
      providers: []
    }),
    method: 'GET',
    path: /^\/api\/tools\/toolsets\/([^/]+)\/config$/
  },
  {
    handle: async (): Promise<TerminalBackendsResponse> => ({
      active: 'sandbox',
      backends: [
        {
          active: true,
          description: "Commands run in Vanta's own sandbox, and each one passes the approval gate first.",
          detail: '',
          label: 'Vanta sandbox',
          name: 'sandbox',
          status: 'ready'
        }
      ]
    }),
    method: 'GET',
    path: /^\/api\/tools\/terminal\/backends$/
  },
  {
    handle: async (): Promise<ElevenLabsVoicesResponse> => ({ available: false, voices: [] }),
    method: 'GET',
    path: /^\/api\/audio\/elevenlabs\/voices$/
  },
  {
    handle: async ({ query }): Promise<AnalyticsResponse> => ({
      by_model: [],
      daily: [],
      period_days: Number(query.get('days')) || DEFAULT_PERIOD_DAYS,
      skills: { summary: { distinct_skills_used: 0, total_skill_actions: 0, total_skill_edits: 0, total_skill_loads: 0 }, top_skills: [] },
      tools: [],
      totals: {
        total_actual_cost: 0,
        total_api_calls: null,
        total_cache_read: null,
        total_estimated_cost: 0,
        total_input: null,
        total_output: null,
        total_reasoning: null,
        total_sessions: 0
      }
    }),
    method: 'GET',
    path: /^\/api\/analytics\/usage$/
  },
  {
    // Vanta has one home; there is no active profile to report.
    handle: async () => ({ active: 'default', current: 'default' }),
    method: 'GET',
    path: /^\/api\/profiles\/active$/
  },
  {
    // Legacy rows from before sessions carried an owner: Vanta sessions always do.
    handle: async ({ body }) => ({ ok: true, profile: text(body.profile, 'default'), stamped: 0 }),
    method: 'POST',
    path: /^\/api\/sessions\/owner-backfill$/
  }
]
