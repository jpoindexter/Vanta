// The context-compression engine lives in the standalone `winnow` package; Vanta
// consumes it so there's one implementation to maintain. This module re-exports the
// engine's core types/helpers under the paths the rest of compress/ already imports.
export { estTokens, DEFAULTS } from "winnow";
export type { ContentType, CompressResult, CompressOptions } from "winnow";
