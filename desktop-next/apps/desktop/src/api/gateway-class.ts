import { GATEWAY_NOT_CONNECTED_MESSAGE, HermesGateway as HermesWebSocketGateway } from './client'
import { bridgeTransport, hasVantaBridge } from './vanta/bridge-transport'
import { VantaGateway } from './vanta-gateway'

// The Vanta shell's gateway: HTTP plus one SSE stream per chat, through the Electron bridge.
class VantaBridgeGateway extends VantaGateway {
  constructor() {
    super({ notConnectedMessage: GATEWAY_NOT_CONNECTED_MESSAGE, transport: bridgeTransport() })
  }
}

// One name, chosen once by what the shell exposes: a preload with `hermesDesktop.vanta` is the Vanta shell, so chat
// runs over HTTP/SSE; anything else keeps the original WebSocket client (and the tests that fake its socket).
// Both classes extend JsonRpcGatewayClient, so every caller's `HermesGateway` type is satisfied either way.
export type HermesGateway = HermesWebSocketGateway
export const HermesGateway = (
  hasVantaBridge() ? VantaBridgeGateway : HermesWebSocketGateway
) as unknown as typeof HermesWebSocketGateway
