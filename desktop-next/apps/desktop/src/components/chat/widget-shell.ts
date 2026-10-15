/**
 * Inline transcript widgets — the few tool results that render as a panel the
 * user reads or acts on (a clarify question, an artifact card) rather than as
 * a scaffold line.
 *
 * They share one shell so they cannot drift apart: the Vanta card, flat, with a
 * hairline border and a 12px radius (the same as the approval and diff cards).
 * Cards never nest inside cards.
 */
export const WIDGET_SHELL_CLASS = 'vp-card'
