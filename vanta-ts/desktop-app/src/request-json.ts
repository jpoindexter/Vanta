export function postJson(body: unknown): RequestInit {
  return { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) };
}

export function jsonHeaders(): Record<string, string> { return { "content-type": "application/json" }; }
