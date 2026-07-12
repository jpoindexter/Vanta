export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  let body: { error?: string } & T;
  try {
    if (typeof res.text === "function") {
      const text = await res.text();
      body = (text ? JSON.parse(text) : {}) as { error?: string } & T;
    } else body = await res.json() as { error?: string } & T;
  }
  catch { throw new Error(`Vanta returned an invalid response (${res.status}).`); }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}
