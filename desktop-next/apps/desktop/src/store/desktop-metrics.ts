/**
 * Vanta does not collect usage metrics. This module keeps the closed vocabularies
 * (types and pure id helpers) that call sites use, and every recorder is a no-op:
 * nothing is stored, queued or sent. It exists so the imported Vanta call sites
 * compile unchanged; delete a call site together with its import when you touch it.
 */

import { atom } from 'nanostores'

import type { SharedMetricsRequester } from './shared-metrics'

// ── closed vocabularies ────────────────────────────────────────

/** Settings views (SETTINGS_VIEWS in app/settings/index.tsx) → area. */
const SETTINGS_AREAS: Record<string, DesktopFeatureArea> = {
  about: 'settings_about',
  billing: 'settings_billing',
  'config:advanced': 'settings_config_advanced',
  'config:appearance': 'settings_config_appearance',
  'config:browser': 'settings_config_browser',
  'config:chat': 'settings_config_chat',
  'config:memory': 'settings_config_memory',
  'config:model': 'settings_config_model',
  'config:safety': 'settings_config_safety',
  'config:voice': 'settings_config_voice',
  'config:workspace': 'settings_config_workspace',
  // Legacy alias: the Connections tab redirects to Gateways.
  connections: 'settings_gateway',
  gateway: 'settings_gateway',
  keybinds: 'settings_keybinds',
  keys: 'settings_keys',
  notifications: 'settings_notifications',
  providers: 'settings_providers',
  sessions: 'settings_sessions',
  vault: 'settings_vault'
}

export type DesktopFeatureArea =
  | 'agents'
  | 'artifacts'
  | 'bot_mode'
  | 'browser_pane'
  | 'capabilities'
  | 'command_center'
  | 'command_palette'
  | 'cron'
  | 'extension_page'
  | 'file_pane'
  | 'find_in_page'
  | 'kanban'
  | 'messaging'
  | 'model_picker'
  | 'other'
  | 'profiles'
  | 'projects'
  | 'review_pane'
  | 'session_import'
  | 'session_picker'
  | 'session_search'
  | 'session_switcher'
  | 'settings_about'
  | 'settings_billing'
  | 'settings_config_advanced'
  | 'settings_config_appearance'
  | 'settings_config_browser'
  | 'settings_config_chat'
  | 'settings_config_memory'
  | 'settings_config_model'
  | 'settings_config_safety'
  | 'settings_config_voice'
  | 'settings_config_workspace'
  | 'settings_gateway'
  | 'settings_keybinds'
  | 'settings_keys'
  | 'settings_notifications'
  | 'settings_other'
  | 'settings_providers'
  | 'settings_sessions'
  | 'settings_vault'
  | 'skins'
  | 'starmap'
  | 'terminal_pane'
  | 'voice_conversation'
  | 'voice_dictation'
  | 'webhooks'

/** First path segment of a full-page route (APP_ROUTES) → area. Chat paths carry session ids and map to nothing. */
const ROUTE_AREAS: Record<string, DesktopFeatureArea> = {
  agents: 'agents',
  artifacts: 'artifacts',
  capabilities: 'capabilities',
  'command-center': 'command_center',
  cron: 'cron',
  kanban: 'kanban',
  messaging: 'messaging',
  profiles: 'profiles',
  'session-import': 'session_import',
  settings: 'settings_other',
  starmap: 'starmap',
  webhooks: 'webhooks'
}

export function settingsArea(view: string): DesktopFeatureArea {
  return SETTINGS_AREAS[view] ?? 'settings_other'
}

/** The area a full-page route opens, or null for chat/session routes. Contributed
 *  plugin pages (one-segment paths the core does not own) are `extension_page`. */
export function routeArea(pathname: string, contributedPaths: readonly string[] = []): DesktopFeatureArea | null {
  const segment = pathname.replace(/^\/+/, '').split(/[/?#]/)[0] ?? ''

  if (!segment || segment === 'settings') {
    return null
  }

  if (ROUTE_AREAS[segment]) {
    return ROUTE_AREAS[segment]
  }

  return contributedPaths.includes(`/${segment}`) ? 'extension_page' : null
}

export type DesktopFrictionKind =
  'backend_disconnect' | 'error_toast' | 'notice_dismissed' | 'renderer_crash' | 'slow_frame'

/** notifyError's summary rules (store/notifications.ts) → category. */
export type ErrorToastCategory =
  | 'api_key_missing'
  | 'api_key_rejected'
  | 'disk_full'
  | 'gateway_auth_failed'
  | 'method_not_allowed'
  | 'microphone_permission'
  | 'other'
  | 'pool_slot_timeout'
  | 'restart_required'
  | 'rpc_out_of_sync'
  | 'storage_failure'
  | 'timeout'
  | 'unclassified'

export type DesktopNoticeId =
  | 'artifacts_partial_load'
  | 'background_queue_stuck'
  | 'backend_skew'
  | 'billing_banner'
  | 'billing_block'
  | 'build_discontinued'
  | 'client_behind'
  | 'composer_queue_stuck'
  | 'credits'
  | 'free_tier_notice'
  | 'gateway_error'
  | 'gui_skew'
  | 'install_method'
  | 'mcp_health'
  | 'model_warning'
  | 'other'
  | 'restored_draft'
  | 'runtime_not_ready'
  | 'session_compress'
  | 'terminal_backend'
  | 'tip'
  | 'update_available'
  | 'voice_live_unavailable'
  | 'voice_stop_hint'

/** Stable toast ids the Desktop code passes to notify() → notice id. */
const NOTICE_IDS: Record<string, DesktopNoticeId> = {
  'artifacts-partial-load': 'artifacts_partial_load',
  'backend-contract-skew': 'backend_skew',
  'client-update-after-backend': 'client_behind',
  'composer-queue-stuck': 'composer_queue_stuck',
  'desktop-build-discontinued': 'build_discontinued',
  'desktop-update-available': 'update_available',
  'gui-contract-skew': 'gui_skew',
  'install-method-not-supported': 'install_method',
  'runtime-not-ready': 'runtime_not_ready',
  'terminal-backend-unavailable': 'terminal_backend',
  'voice-live-unavailable': 'voice_live_unavailable',
  'voice-stop-hint': 'voice_stop_hint'
}

/** Toast ids with a data suffix (session id, provider, server key): only the prefix counts. */
const NOTICE_PREFIXES: readonly (readonly [string, DesktopNoticeId])[] = [
  ['billing-block:', 'billing_block'],
  ['composer-background-queue-stuck-', 'background_queue_stuck'],
  ['credits.', 'credits'],
  ['gateway-error:', 'gateway_error'],
  ['mcp-health-', 'mcp_health'],
  ['model-warning-confirm-', 'model_warning'],
  ['session-compress:', 'session_compress']
]

export function noticeIdForToast(id: string): DesktopNoticeId {
  return NOTICE_IDS[id] ?? NOTICE_PREFIXES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? 'other'
}

export type RendererCrashDetail = 'crash' | 'killed' | 'oom' | 'other'
export type BackendDisconnectDetail = 'backend_exit' | 'network' | 'other' | 'timeout'
export type SlowFrameBucket = '100ms_to_250ms' | '1s_to_5s' | '250ms_to_1s' | 'gte_5s'

export function slowFrameBucket(durationMs: number): SlowFrameBucket | null {
  if (!(durationMs >= 100)) {
    return null
  }

  return durationMs < 250
    ? '100ms_to_250ms'
    : durationMs < 1000
      ? '250ms_to_1s'
      : durationMs < 5000
        ? '1s_to_5s'
        : 'gte_5s'
}

export type DesktopFrictionDetail =
  BackendDisconnectDetail | DesktopNoticeId | ErrorToastCategory | RendererCrashDetail | SlowFrameBucket

export type DesktopOnboardingStep =
  | 'choose_later'
  | 'consent'
  | 'first_message'
  | 'free_tier_ready'
  | 'guide'
  | 'guide_skip'
  | 'model_pick'
  | 'provider_api_key'
  | 'provider_local'
  | 'provider_oauth'
  | 'provider_setup'
  | 'sign_in'

export type DesktopOnboardingEvent = 'abandoned' | 'completed' | 'reached'

/** Button presses that dispatch no keybinding action get a stable id here (and
 *  in DESKTOP_BUTTON_ACTION_IDS on the backend). Everything else uses its
 *  KEYBIND_ACTIONS id (lib/keybinds/actions.ts). */
export const DESKTOP_BUTTON_ACTIONS = {
  composerAttach: 'composer.attach',
  messageCopy: 'message.copy',
  messageRetry: 'message.retry'
} as const

export type DesktopActionVia = 'click' | 'menu' | 'palette' | 'shortcut'


export type DesktopDislikeSignal =
  'cancelled' | 'feature_disabled' | 'quick_close' | 'rage_click' | 'setting_off_default' | 'undo'

export type DesktopFlowId =
  | 'command_palette'
  | 'free_tier_sign_in'
  | 'keybind_capture'
  | 'model_picker'
  | 'project_create'
  | 'provider_oauth'
  | 'session_picker'
  | 'session_switcher'

export type DesktopFeatureToggle =
  | 'backdrop'
  | 'bot_activity_toasts'
  | 'composer_popout_gestures'
  | 'intro_splash'
  | 'native_notifications'
  | 'notification_kind'
  | 'reactions'
  | 'thread_timeline'
  | 'tips'
  | 'tours'
  | 'vibe_hearts'

export type DesktopUndoTarget = 'closed_tab' | 'restored_draft'

export type DesktopMode = 'bots' | 'sessions'

// ── limits ────────────────────────────────────────────────────────────────────

const STATE_KEY = 'hermes.desktop.metrics.v1'
/** Friction per (kind, detail) per day; slow frames per bucket per day. */
const FRICTION_DAILY_CAP = 20
const SLOW_FRAME_DAILY_CAP = 5
const DISLIKE_DAILY_CAP = 20
const QUICK_CLOSE_MS = 5000
const RAGE_CLICK_WINDOW_MS = 1000
const RAGE_CLICK_COUNT = 3
/** A gap between interactions longer than this is idle, not active time. */

export const ACTIVE_IDLE_GAP_MS = 5 * 60_000

/** Always 'off': Vanta never reads or writes a metrics consent. */
export type DesktopMetricsGate = 'off' | 'on' | null

export const $desktopMetricsGate = atom<DesktopMetricsGate>('off')

export const DESKTOP_METRICS_STATE_KEY = 'vanta.desktop.metrics.disabled'

export function recordFeatureUse(_area: DesktopFeatureArea, _now?: number): void {}
export function noteAreaClosed(_area: DesktopFeatureArea, _now?: number): void {}
export function trackArea(_area: DesktopFeatureArea, _open: boolean, _now?: number): void {}
export function trackFlow(_flow: DesktopFlowId, _open: boolean): void {}
export function completeFlow(_flow: DesktopFlowId): void {}
export function noteBackendDrop(_reason: 'timeout' | null, _now?: number): void {}
export function noteBackendExited(_now?: number): void {}
export function cancelPendingBackendDrop(): void {}
export function recordFriction(_kind: DesktopFrictionKind, _detail: DesktopFrictionDetail): void {}
export function recordDislike(
  _signal: DesktopDislikeSignal,
  _target: DesktopFeatureArea | DesktopFeatureToggle | DesktopFlowId | DesktopUndoTarget | string,
  _setting?: string,
  _profile?: null | string
): void {}
export function configPatchKeys(_patch: unknown, _prefix = ''): string[] {
  return []
}
export function recordSettingsSaved(
  _patch: unknown,
  _published: Readonly<Record<string, unknown>>,
  _profile?: null | string
): void {}
export function recordFeatureToggle(_toggle: DesktopFeatureToggle, _wasOn: boolean, _isOn: boolean): void {}
export function recordAction(_rawAction: string, _via: DesktopActionVia, _now?: number): void {}
export function noteInteraction(_now?: number, _mode?: DesktopMode): void {}
export function noteMessageSent(_mode?: DesktopMode): void {}
export function setDesktopBotCount(_count: number): void {}
export function recordOnboarding(_step: DesktopOnboardingStep, _event: DesktopOnboardingEvent): void {}
export function closeOnboardingStep(_step: DesktopOnboardingStep): void {}
export function flushDesktopMetrics(): void {}
export function setDesktopMetricsGate(_next: DesktopMetricsGate, _decided = true): void {}
export function bindDesktopMetrics(_next: SharedMetricsRequester | null, _profileScope?: string): void {}
export function tickDesktopMetrics(_now?: number): void {}
export function resetDesktopMetricsForTests(): void {}
