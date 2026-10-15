import { IconCircle } from "@tabler/icons-react";
import { useStore } from "@nanostores/react";

import { useI18n } from "@/i18n";
import { reconnectGateway } from "@/store/gateway-reconnect";
import { $gatewayState } from "@/store/session";

/** Pushes the thread down while the backend is away. The composer stays usable
 *  and messages queue until the connection returns. */
export function OfflineBanner() {
  const { t } = useI18n();
  const gateway = useStore($gatewayState);

  if (gateway !== "closed" && gateway !== "error") {
    return null;
  }

  return (
    <div className="vs-banner" data-testid="offline-banner" role="status">
      <IconCircle aria-hidden size={12} />
      {t.vantaShell.offline.banner}
      <button
        onClick={() => void reconnectGateway().catch(() => undefined)}
        type="button"
      >
        {t.vantaShell.offline.retry}
      </button>
    </div>
  );
}
