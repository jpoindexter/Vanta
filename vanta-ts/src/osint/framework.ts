export type OsintIdentifier = {
  kind: "name" | "domain" | "ticker" | "jurisdiction";
  value: string;
};

export type OsintSource = {
  id: string;
  label: string;
  homeUrl: string;
  searchUrl: string;
  purpose: string;
  identifiers: OsintIdentifier["kind"][];
  receiptExpiryDays: number;
};

export type OsintEvidenceField = {
  name: string;
  required: boolean;
  note: string;
};

export type OsintPlan = {
  subject: string;
  normalizedSubject: string;
  identifiers: OsintIdentifier[];
  phases: string[];
  sources: OsintSource[];
  evidenceFields: OsintEvidenceField[];
  guardrails: string[];
};

export type OsintPlanOptions = {
  domain?: string;
  ticker?: string;
  jurisdiction?: string;
};

const SOURCE_CATALOG: OsintSource[] = [
  {
    id: "sec-edgar",
    label: "SEC EDGAR filings",
    homeUrl: "https://www.sec.gov/search-filings",
    searchUrl: "https://www.sec.gov/edgar/search/",
    purpose: "Public-company filings, issuer identity, events, risk factors, officers, and exhibits.",
    identifiers: ["name", "ticker"],
    receiptExpiryDays: 30,
  },
  {
    id: "usaspending",
    label: "USAspending awards",
    homeUrl: "https://www.usaspending.gov/",
    searchUrl: "https://www.usaspending.gov/keyword_search",
    purpose: "Federal contracts, grants, loans, recipient profiles, and award history.",
    identifiers: ["name"],
    receiptExpiryDays: 30,
  },
  {
    id: "ofac-sanctions",
    label: "OFAC sanctions search",
    homeUrl: "https://ofac.treasury.gov/sanctions-list-search-tool",
    searchUrl: "https://sanctionssearch.ofac.treas.gov/",
    purpose: "Potential sanctions-list matches requiring careful false-positive review.",
    identifiers: ["name"],
    receiptExpiryDays: 7,
  },
  {
    id: "opencorporates",
    label: "OpenCorporates legal entities",
    homeUrl: "https://opencorporates.com/",
    searchUrl: "https://opencorporates.com/",
    purpose: "Legal-entity records, registry references, jurisdictions, and related names.",
    identifiers: ["name", "jurisdiction"],
    receiptExpiryDays: 30,
  },
  {
    id: "courtlistener",
    label: "CourtListener legal search",
    homeUrl: "https://www.courtlistener.com/",
    searchUrl: "https://www.courtlistener.com/",
    purpose: "Opinions, dockets where available, parties, judges, and legal-issue context.",
    identifiers: ["name"],
    receiptExpiryDays: 14,
  },
  {
    id: "icann-lookup",
    label: "ICANN Lookup",
    homeUrl: "https://lookup.icann.org/",
    searchUrl: "https://lookup.icann.org/",
    purpose: "Domain registration data and internet-number registration context.",
    identifiers: ["domain"],
    receiptExpiryDays: 30,
  },
];

const EVIDENCE_FIELDS: OsintEvidenceField[] = [
  { name: "claim", required: true, note: "Atomic assertion being supported or rejected." },
  { name: "sourceId", required: true, note: "One of the plan source ids." },
  { name: "url", required: true, note: "Exact public-record URL observed." },
  { name: "retrievedAt", required: true, note: "ISO timestamp for when the evidence was captured." },
  { name: "excerpt", required: true, note: "Small quoted span or structured field value." },
  { name: "confidence", required: true, note: "low, medium, or high after entity-resolution checks." },
  { name: "expiresAt", required: true, note: "ISO timestamp when the receipt must be refreshed." },
];

export function buildOsintPlan(subject: string, opts: OsintPlanOptions = {}): OsintPlan {
  const normalizedSubject = normalizeSubject(subject);
  if (!normalizedSubject) throw new Error("subject is required");
  const identifiers = buildIdentifiers(normalizedSubject, opts);
  return {
    subject,
    normalizedSubject,
    identifiers,
    phases: [
      "entity-resolution: collect aliases, domains, tickers, jurisdictions, and disqualifiers",
      "source-queries: run each source search and record zero-result searches too",
      "evidence-chain: convert every useful fact into claim/source/date/expiry receipts",
      "conflict-review: separate confirmed facts, plausible matches, false positives, and gaps",
      "operator-summary: state what is known, what is not known, and the next public-record query",
    ],
    sources: sourceCatalogFor(identifiers),
    evidenceFields: EVIDENCE_FIELDS,
    guardrails: [
      "No API keys are required by this planner.",
      "Do not treat same-name matches as identity matches without corroborating identifiers.",
      "Do not infer wrongdoing from watchlist, docket, or award search results alone.",
      "Prefer primary public-record pages over summaries; keep retrieval dates and expiry dates.",
    ],
  };
}

export function formatOsintPlan(plan: OsintPlan): string {
  const lines = [
    `OSINT plan: ${plan.normalizedSubject}`,
    `identifiers: ${formatIdentifiers(plan.identifiers)}`,
    "",
    "Phases",
    ...plan.phases.map((phase, idx) => `${idx + 1}. ${phase}`),
    "",
    "Source starts",
    ...plan.sources.map(formatSource),
    "",
    "Evidence receipt fields",
    ...plan.evidenceFields.map((field) => `- ${field.name}${field.required ? " *" : ""}: ${field.note}`),
    "",
    "Guardrails",
    ...plan.guardrails.map((guardrail) => `- ${guardrail}`),
  ];
  return lines.join("\n");
}

function buildIdentifiers(subject: string, opts: OsintPlanOptions): OsintIdentifier[] {
  return [
    { kind: "name", value: subject },
    opts.domain ? { kind: "domain", value: opts.domain.trim().toLowerCase() } : null,
    opts.ticker ? { kind: "ticker", value: opts.ticker.trim().toUpperCase() } : null,
    opts.jurisdiction ? { kind: "jurisdiction", value: opts.jurisdiction.trim() } : null,
  ].filter((id): id is OsintIdentifier => Boolean(id?.value));
}

function sourceCatalogFor(identifiers: OsintIdentifier[]): OsintSource[] {
  const kinds = new Set(identifiers.map((id) => id.kind));
  return SOURCE_CATALOG.filter((source) => source.identifiers.some((kind) => kinds.has(kind)));
}

function formatSource(source: OsintSource): string {
  return [
    `- ${source.id}: ${source.label}`,
    `  start: ${source.searchUrl}`,
    `  use for: ${source.purpose}`,
    `  receipt expiry: ${source.receiptExpiryDays} days`,
  ].join("\n");
}

function formatIdentifiers(ids: OsintIdentifier[]): string {
  return ids.map((id) => `${id.kind}=${id.value}`).join(", ");
}

function normalizeSubject(subject: string): string {
  return subject.trim().replace(/\s+/g, " ");
}
