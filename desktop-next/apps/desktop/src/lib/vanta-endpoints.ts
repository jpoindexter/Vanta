/**
 * Hosted endpoints the renderer may talk to. Vanta runs locally and ships with
 * none: each entry stays null until a Vanta service is configured, and the
 * control that depends on it shows a "not configured" state instead of calling
 * out. Set a value here (or wire it to settings) to turn the feature on.
 */

/** Base URL of a Vanta desktop update feed. Null: updates are not configured. */
export const VANTA_UPDATE_FEED_URL: null | string = null

/** Endpoint that receives a user-approved diagnostics bundle. Null: upload is not configured. */
export const VANTA_DIAGNOSTICS_UPLOAD_URL: null | string = null

/** Origin of a Vanta skills and plugin hub (pages with an `?embed=picker` view). Null: the embedded
 *  hub pickers are not shown and the catalog feed is never fetched. */
export const VANTA_HUB_ORIGIN: null | string = null

/** Where "report a problem" links go once a bundle exists or upload is off. */
export const VANTA_SUPPORT_URL = 'https://github.com/jpoindexter/Vanta/issues'

/** Vanta documentation; opened only when the user clicks a docs link. */
export const VANTA_DOCS_URL = 'https://docs.vanta.theft.studio'

export const isUpdateFeedConfigured = (): boolean => VANTA_UPDATE_FEED_URL !== null

export const isHubConfigured = (): boolean => VANTA_HUB_ORIGIN !== null

export const isDiagnosticsUploadConfigured = (): boolean => VANTA_DIAGNOSTICS_UPLOAD_URL !== null
