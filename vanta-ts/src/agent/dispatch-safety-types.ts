export type SafetyGateResult = {
  approved: boolean;
  reason?: string;
  sandboxWritableDirs?: string[];
  /** Exact Ask action already resolved by this gate. */
  effectApprovalAction?: string;
  effectApprovalReusable?: boolean;
  /** Canonical target covered by this delegated decision; file tools must recheck it. */
  delegatedWritePath?: string;
};


export type DiffCapable = { describeDiff?: (args: Record<string, unknown>, root: string) => Promise<string | undefined> };
