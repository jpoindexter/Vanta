import type { McpAuthConfig } from "./auth-flow.js";

// Tracks MCP servers whose connection failed with an auth-required signal. When
// a server is auth-pending, its real tools are NOT registered; instead the
// agent sees `mcp_auth` and can kick off the OAuth flow for that server. Pure
// in-memory state (no IO) so it's trivially testable; a module-level singleton
// bridges the mount path (records pending) and the `mcp_auth` tool (reads +
// clears on reconnect), the same shape as buildRegistry wiring `mount_mcp`.

/** One auth-pending server: enough to surface the URL and later reconnect. */
export type PendingServer = {
  name: string;
  authConfig: McpAuthConfig;
};

export class AuthPendingRegistry {
  private readonly pending = new Map<string, PendingServer>();

  /** Mark a server auth-pending (overwrites any prior entry for that name). */
  mark(name: string, authConfig: McpAuthConfig): void {
    this.pending.set(name, { name, authConfig });
  }

  get(name: string): PendingServer | undefined {
    return this.pending.get(name);
  }

  has(name: string): boolean {
    return this.pending.has(name);
  }

  /** Server names awaiting auth, sorted for stable output. */
  names(): string[] {
    return [...this.pending.keys()].sort();
  }

  /** Clear a server once it has reconnected (its real tools are now live). */
  clear(name: string): void {
    this.pending.delete(name);
  }
}

/** Process-wide pending registry shared by the mount path and the mcp_auth tool. */
export const authPending = new AuthPendingRegistry();
