// Test-suite default: opt past the project-hooks trust gate so hook-mechanics
// tests (which use throwaway temp "project" dirs that carry no trust decision)
// can load + fire hooks. Production default is DENY for untrusted project hooks
// (the zero-click-RCE fix in hooks/shell-hooks.ts); that default-deny behavior is
// verified explicitly in hooks/shell-hooks.test.ts (which unsets this flag).
process.env.VANTA_ENABLE_PROJECT_HOOKS = "1";

// shell_cmd/self_correct now sandbox by default where a backend exists (macOS seatbelt).
// Tests need real host exec for their command assertions, so opt out suite-wide; the
// default-on decision is unit-tested via shouldSandboxShell in tools.test.ts.
process.env.VANTA_SHELL_SANDBOX = "0";
