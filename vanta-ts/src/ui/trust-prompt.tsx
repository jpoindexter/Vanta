import { render } from "ink";
import { TrustDialog, type TrustRequest } from "./trust-dialog.js";

// Interactive confirmer for the startup trust gate. Renders a one-off TrustDialog
// on real Ink, awaits the decision, then unmounts — this runs BEFORE the main TUI
// App mounts (in prepareRun), so there is no competing renderer. Headless hosts
// pass no confirmer and the gate fails safe (no trust granted).

/** Show the TrustDialog and resolve to the operator's decision. */
export function promptTrust(request: TrustRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (trusted: boolean): void => {
      if (settled) return;
      settled = true;
      instance.unmount();
      resolve(trusted);
    };
    const instance = render(<TrustDialog request={request} onDecide={finish} />);
  });
}
