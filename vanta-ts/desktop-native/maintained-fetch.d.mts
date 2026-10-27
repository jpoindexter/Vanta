// Bridge Undici's Node declarations to the existing DOM-compatible injection API.
// Runtime exports are the same coherent Fetch family, not converted wrappers.
export const maintainedFetch: typeof globalThis.fetch;
export const fetchGlobals: Readonly<Pick<typeof globalThis,
  "fetch" | "Headers" | "Request" | "Response" | "FormData"
>>;
