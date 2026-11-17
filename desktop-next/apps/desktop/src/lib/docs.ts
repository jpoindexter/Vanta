import { VANTA_DOCS_URL } from '@/lib/vanta-endpoints'

/**
 * docs.ts — canonical docs-site links used by the renderer's recovery and
 * setup surfaces. Single authority so the "reinstall the app" affordance
 * (bundled installs with a damaged payload) and any future doc links point
 * at the same place.
 */
export const DESKTOP_DOCS_URL = VANTA_DOCS_URL
