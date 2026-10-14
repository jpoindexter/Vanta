import type { Handler } from './handlers-session'
import { expectOk, parseBody } from './rpc'
import { profileListSchema, toProfileInfo } from './shim-profiles'

/**
 * The profile roster the Bots tab and the profile rail ask for. Vanta profiles carry no per-bot
 * presentation data (title, colour, avatar), so `ui_meta` is empty and the renderer keeps those locally.
 */
export const profilesList: Handler = async hub => {
  const { profiles } = parseBody(
    profileListSchema,
    expectOk(await hub.caller.get(undefined, '/api/profiles'), 'profiles.list'),
    'profiles.list'
  )

  return {
    bot_mode_protocol: false,
    profiles: profiles.map(view => ({
      ...toProfileInfo(view),
      canonical_session: null,
      last_session: null,
      ui_meta: {}
    }))
  }
}
