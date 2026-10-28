import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router";

import { sessionRoute } from "../../../routes";

interface CreatedSessionGuardOptions {
  creatingSessionRef: MutableRefObject<boolean>;
  navigate: NavigateFunction;
  routedSessionId: string | null;
  selectedStoredSessionId: string | null;
  selectedStoredSessionIdRef: MutableRefObject<string | null>;
}

interface RouteSettlementOptions extends CreatedSessionGuardOptions {
  pendingIdRef: MutableRefObject<string | null>;
  fromRouteRef: MutableRefObject<string | null>;
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  release: () => void;
}

const CREATE_GUARD_RELEASE_MS = 3_000;

function useRouteSettlement({
  creatingSessionRef,
  routedSessionId,
  selectedStoredSessionId,
  selectedStoredSessionIdRef,
  pendingIdRef,
  fromRouteRef,
  timeoutRef,
  release,
}: RouteSettlementOptions) {
  useEffect(
    () => () => {
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    },
    [timeoutRef],
  );

  useEffect(() => {
    const pending = pendingIdRef.current;
    if (!creatingSessionRef.current || !pending) return;

    if (routedSessionId === pending && selectedStoredSessionIdRef.current === pending) {
      release();
      return;
    }

    if (routedSessionId !== fromRouteRef.current && routedSessionId !== pending) release();
  }, [
    creatingSessionRef,
    release,
    routedSessionId,
    selectedStoredSessionId,
    selectedStoredSessionIdRef,
    pendingIdRef,
    fromRouteRef,
  ]);
}

/** Keep create/fork's hold until route and selection agree, or recovery releases it. */
export function useCreatedSessionGuard(options: CreatedSessionGuardOptions) {
  const { creatingSessionRef, navigate, routedSessionId } = options;
  const pendingIdRef = useRef<string | null>(null);
  const fromRouteRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseCreatingSessionGuard = useCallback(() => {
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingIdRef.current = null;
    fromRouteRef.current = null;
    creatingSessionRef.current = false;
  }, [creatingSessionRef]);

  const armPendingCreatedSession = useCallback(
    (storedId: string) => {
      pendingIdRef.current = storedId;
      fromRouteRef.current = routedSessionId;
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (pendingIdRef.current !== storedId) return;
        // Retry the stuck route before allowing ordinary resume to recover it.
        try {
          navigate(sessionRoute(storedId), { replace: true });
        } catch {
          // Release still unblocks recovery when navigation fails.
        }
        releaseCreatingSessionGuard();
      }, CREATE_GUARD_RELEASE_MS);
    },
    [navigate, releaseCreatingSessionGuard, routedSessionId],
  );
  const hasPendingCreatedSession = useCallback(() => Boolean(pendingIdRef.current), []);

  useRouteSettlement({
    ...options,
    pendingIdRef,
    fromRouteRef,
    timeoutRef,
    release: releaseCreatingSessionGuard,
  });
  return {
    armPendingCreatedSession,
    releaseCreatingSessionGuard,
    hasPendingCreatedSession,
  };
}
