// Test-suite default: opt past the project-hooks trust gate so hook-mechanics
// tests (which use throwaway temp "project" dirs that carry no trust decision)
// can load + fire hooks. Production default is DENY for untrusted project hooks
// (the zero-click-RCE fix in hooks/shell-hooks.ts); that default-deny behavior is
// verified explicitly in hooks/shell-hooks.test.ts (which unsets this flag).
process.env.VANTA_ENABLE_PROJECT_HOOKS = "1";
