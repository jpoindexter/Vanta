import { GATEWAY_NOT_CONNECTED_MESSAGE, VantaGateway as VantaWebSocketGateway } from './client'
import { bridgeTransport, hasVantaBridge } from './vanta/bridge-transport'
import { VantaGateway as VantaHttpGateway } from './vanta-gateway'

// The Vanta shell's gateway: HTTP plus one SSE stream per chat, through the Electron bridge.
class VantaBridgeGateway extends VantaHttpGateway {
  private readonly bridge: ReturnType<typeof bridgeTransport>

  constructor() {
    const bridge = bridgeTransport()
    super({ notConnectedMessage: GATEWAY_NOT_CONNECTED_MESSAGE, transport: bridge })
    this.bridge = bridge
  }

  override async connect(url: string): Promise<void> {
    this.bridge.bindOwner(url)
    return super.connect(url)
  }
}

// One name, chosen once by what the shell exposes: a preload with `desktopBridge.vanta` is the Vanta shell, so chat
// runs over HTTP/SSE; anything else keeps the original WebSocket client (and the tests that fake its socket).
// Both classes extend JsonRpcGatewayClient, so every caller's `VantaGateway` type is satisfied either way.
export type VantaGateway = VantaWebSocketGateway
export const VantaGateway = (
  hasVantaBridge() ? VantaBridgeGateway : VantaWebSocketGateway
) as unknown as typeof VantaWebSocketGateway
