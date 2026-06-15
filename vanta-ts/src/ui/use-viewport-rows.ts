import { useEffect, useState } from "react";
import { useStdout } from "ink";

// Ink does NOT re-render React on terminal resize (it only recomputes Yoga
// layout). The bottom-pin spacer (see pinned-region.tsx) needs the live viewport
// height AND width to recompute, so this hook subscribes to stdout 'resize' and
// triggers a re-render with the current dimensions.

export type Viewport = { rows: number; cols: number };

const read = (stdout?: NodeJS.WriteStream): Viewport => ({ rows: stdout?.rows ?? 24, cols: stdout?.columns ?? 80 });

export function useViewportRows(): Viewport {
  const { stdout } = useStdout();
  const [vp, setVp] = useState<Viewport>(() => read(stdout));
  useEffect(() => {
    const on = (): void => setVp(read(stdout));
    on(); // sync once on mount in case the size changed before subscribe
    stdout?.on("resize", on);
    return () => { stdout?.off("resize", on); };
  }, [stdout]);
  return vp;
}
