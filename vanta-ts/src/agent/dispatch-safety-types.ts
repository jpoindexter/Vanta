export type SafetyGateResult = {
  approved: boolean;
  reason?: string;
  sandboxWritableDirs?: string[];
  /** Exact Ask action already resolved by this gate. */
  effectApprovalAction?: string;
  effectApprovalReusable?: boolean;
};


export type DiffCapable = { describeDiff?: (args: Record<string, unknown>, root: string) => Promise<string | undefined> };
