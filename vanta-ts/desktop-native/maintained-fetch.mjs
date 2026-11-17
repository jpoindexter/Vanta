import { fetch, Headers, Request, Response, FormData } from "undici";

// Importing this module does not replace application globals. Electron main can
// inject the maintained transport without changing browser or SDK consumers.
export const maintainedFetch = fetch;
export const fetchGlobals = Object.freeze({ fetch, Headers, Request, Response, FormData });
