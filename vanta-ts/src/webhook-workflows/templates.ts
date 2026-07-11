export type WebhookTemplateId = "github-pr" | "email" | "subscriber" | "generic";

export type WebhookTemplate = {
  name: string;
  description: string;
  prompt: string;
  samplePayload: string;
};

export const WEBHOOK_TEMPLATES: Record<WebhookTemplateId, WebhookTemplate> = {
  "github-pr": {
    name: "GitHub pull request",
    description: "Review or triage a GitHub pull request event.",
    prompt: "Handle this GitHub pull request event. Inspect the action and summarize the next approved work:\n{body}",
    samplePayload: JSON.stringify({ action: "opened", pull_request: { number: 42, title: "Example change", html_url: "https://github.com/example/repo/pull/42" } }),
  },
  email: {
    name: "Inbound email",
    description: "Triage a normalized inbound email event.",
    prompt: "Triage this inbound email. Summarize it and propose the next approved action:\n{body}",
    samplePayload: JSON.stringify({ from: "person@example.com", subject: "Example request", text: "Please review this request." }),
  },
  subscriber: {
    name: "Form or subscriber",
    description: "Respond to a signup, lead, or form submission.",
    prompt: "Handle this form or subscriber event. Classify it and prepare the next approved action:\n{body}",
    samplePayload: JSON.stringify({ event: "subscriber.created", email: "person@example.com", source: "website" }),
  },
  generic: {
    name: "Generic HMAC POST",
    description: "Handle any JSON event protected by an HMAC signature.",
    prompt: "Handle this inbound webhook event and summarize the next approved action:\n{body}",
    samplePayload: JSON.stringify({ event: "example.created", id: "evt_123", data: { status: "new" } }),
  },
};

export function isWebhookTemplate(value: string): value is WebhookTemplateId {
  return Object.hasOwn(WEBHOOK_TEMPLATES, value);
}
