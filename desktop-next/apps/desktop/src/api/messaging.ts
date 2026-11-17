import type {
  MessagingPlatformsResponse,
  MessagingPlatformTestResponse,
  MessagingPlatformUpdate,
  PairingResponse,
  PairingUser,
  TelegramOnboardingApplyResponse,
  TelegramOnboardingStartResponse,
  TelegramOnboardingStatusResponse,
  WebhookCreatePayload,
  WebhookCreateResponse,
  WebhookEnableResponse,
  WebhooksResponse
} from '@/types/desktop'

import { vantaApi, profileScoped } from './client'

export function getMessagingPlatforms(profile?: null | string): Promise<MessagingPlatformsResponse> {
  return vantaApi<MessagingPlatformsResponse>({
    ...profileScoped(profile),
    path: '/api/messaging/platforms'
  })
}

/** `hot_served`: a live multiplexer serving this named profile rebuilt its adapters from the new
 *  credentials right away — no gateway restart is needed for the change to take effect. */
export interface MessagingPlatformUpdateResponse {
  hot_served?: boolean
  ok: boolean
  platform: string
}

export function updateMessagingPlatform(
  platformId: string,
  body: MessagingPlatformUpdate,
  profile?: null | string
): Promise<MessagingPlatformUpdateResponse> {
  return vantaApi<MessagingPlatformUpdateResponse>({
    ...profileScoped(profile),
    path: `/api/messaging/platforms/${encodeURIComponent(platformId)}`,
    method: 'PUT',
    body
  })
}

export function testMessagingPlatform(
  platformId: string,
  profile?: null | string
): Promise<MessagingPlatformTestResponse> {
  return vantaApi<MessagingPlatformTestResponse>({
    ...profileScoped(profile),
    path: `/api/messaging/platforms/${encodeURIComponent(platformId)}/test`,
    method: 'POST'
  })
}

// -- Telegram QR onboarding ---------------------------------------------------
// Pairing state lives in the memory of the backend process that started it, so
// every call in one flow carries the SAME profile scope — the Electron router
// picks the backend from it, and a mismatched apply would 404 the pairing.

export function startTelegramOnboarding(
  botName?: string,
  profile?: null | string
): Promise<TelegramOnboardingStartResponse> {
  return vantaApi<TelegramOnboardingStartResponse>({
    ...profileScoped(profile),
    path: '/api/messaging/telegram/onboarding/start',
    method: 'POST',
    body: botName ? { bot_name: botName } : {}
  })
}

export function getTelegramOnboardingStatus(
  pairingId: string,
  profile?: null | string
): Promise<TelegramOnboardingStatusResponse> {
  return vantaApi<TelegramOnboardingStatusResponse>({
    ...profileScoped(profile),
    path: `/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`
  })
}

export function applyTelegramOnboarding(
  pairingId: string,
  allowedUserIds: string[],
  profile?: null | string
): Promise<TelegramOnboardingApplyResponse> {
  const scope = profileScoped(profile)

  return vantaApi<TelegramOnboardingApplyResponse>({
    ...scope,
    path: `/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}/apply`,
    method: 'POST',
    body: { allowed_user_ids: allowedUserIds, profile: scope.profile }
  })
}

export function cancelTelegramOnboarding(pairingId: string, profile?: null | string): Promise<{ ok: boolean }> {
  return vantaApi<{ ok: boolean }>({
    ...profileScoped(profile),
    path: `/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`,
    method: 'DELETE'
  })
}

// -- Pairing (who may DM the bot) --------------------------------------------
// Unknown DMers get a one-time code and land in `pending` until an admin
// approves them. Approval grants on the row's `request_id`, never on the code:
// the code is the requester's proof that the channel is theirs and is never
// returned by the API, while an authenticated admin is only ever identifying
// a row they can already see.

export function getPairing(profile?: null | string): Promise<PairingResponse> {
  return vantaApi<PairingResponse>({
    ...profileScoped(profile),
    path: '/api/pairing'
  })
}

export function approvePairing(
  platform: string,
  requestId: string,
  profile?: null | string
): Promise<{ ok: boolean; user: PairingUser }> {
  const scope = profileScoped(profile)

  return vantaApi<{ ok: boolean; user: PairingUser }>({
    ...scope,
    path: '/api/pairing/approve',
    method: 'POST',
    // These endpoints read the profile off the body, not the query string —
    // the request scope alone would approve into the wrong profile's store.
    body: { platform, request_id: requestId, profile: scope.profile }
  })
}

export function revokePairing(platform: string, userId: string, profile?: null | string): Promise<{ ok: boolean }> {
  const scope = profileScoped(profile)

  return vantaApi<{ ok: boolean }>({
    ...scope,
    path: '/api/pairing/revoke',
    method: 'POST',
    body: { platform, user_id: userId, profile: scope.profile }
  })
}

// -- Webhooks (subscription CRUD) --------------------------------------------
// The webhook receiver is its own gateway platform; subscriptions live in a
// shared JSON store the CLI/dashboard also drive. Enable mutates config and
// best-effort restarts the gateway; subscription changes hot-reload.

/** `profile` = the backend owner this view captured at mount; omitted → the
 *  ambient request scope. Keyed explicitly so a view that survives an active
 *  profile switch keeps talking to the profile it belongs to (#71352). */
export function getWebhooks(profile?: null | string): Promise<WebhooksResponse> {
  return vantaApi<WebhooksResponse>({
    ...profileScoped(profile),
    path: '/api/webhooks'
  })
}

export function enableWebhooks(profile?: null | string): Promise<WebhookEnableResponse> {
  return vantaApi<WebhookEnableResponse>({
    ...profileScoped(profile),
    path: '/api/webhooks/enable',
    method: 'POST'
  })
}

export function createWebhook(body: WebhookCreatePayload, profile?: null | string): Promise<WebhookCreateResponse> {
  return vantaApi<WebhookCreateResponse>({
    ...profileScoped(profile),
    path: '/api/webhooks',
    method: 'POST',
    body
  })
}

export function deleteWebhook(name: string, profile?: null | string): Promise<{ ok: boolean }> {
  return vantaApi<{ ok: boolean }>({
    ...profileScoped(profile),
    path: `/api/webhooks/${encodeURIComponent(name)}`,
    method: 'DELETE'
  })
}

export function setWebhookEnabled(
  name: string,
  enabled: boolean,
  profile?: null | string
): Promise<{ enabled: boolean; name: string; ok: boolean }> {
  return vantaApi<{ enabled: boolean; name: string; ok: boolean }>({
    ...profileScoped(profile),
    path: `/api/webhooks/${encodeURIComponent(name)}/enabled`,
    method: 'PUT',
    body: { enabled }
  })
}
