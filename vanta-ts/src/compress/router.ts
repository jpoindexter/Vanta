// Content router — re-exported from the standalone `winnow` engine (single source of
// truth). The CCR stash + retrieval footer are still added by Vanta's apply.ts/
// result-offload.ts, which own Vanta's .vanta/ccr paths and retrieve_original contract.
export { compressText, detectContentType, binaryStub } from "winnow";
