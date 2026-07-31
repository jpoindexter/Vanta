export const GOOGLE_SERVICES = ["gmail", "calendar", "drive"] as const;
export type GoogleService = typeof GOOGLE_SERVICES[number];

const GOOGLE_SCOPES: Record<GoogleService, readonly [string]> = {
  gmail: ["https://www.googleapis.com/auth/gmail.modify"],
  calendar: ["https://www.googleapis.com/auth/calendar"],
  drive: ["https://www.googleapis.com/auth/drive"],
};

export function googleScopesFor(service: GoogleService): string[] {
  return [...GOOGLE_SCOPES[service]];
}

export function isGoogleService(value: unknown): value is GoogleService {
  return typeof value === "string" && GOOGLE_SERVICES.includes(value as GoogleService);
}

export function googleServiceForUrl(url: string): GoogleService {
  if (/gmail\.googleapis\.com/i.test(url)) return "gmail";
  if (/googleapis\.com\/calendar\//i.test(url)) return "calendar";
  if (/googleapis\.com\/(?:upload\/)?drive\//i.test(url)) return "drive";
  throw new Error(`Google API URL is not bound to a supported capability: ${new URL(url).origin}`);
}
