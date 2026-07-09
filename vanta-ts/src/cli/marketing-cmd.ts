import { formatMarketing, readMarketing, type MarketingProvider } from "../marketing/connectors.js";

export async function runMarketingCommand(rest: string[]): Promise<number> {
  const sub = rest[0] ?? "read";
  if (sub !== "read") {
    console.error("usage: vanta marketing read <amplitude|customerio> [--fixture <json>]");
    return 1;
  }
  const provider = rest[1] as MarketingProvider | undefined;
  const fixtureIdx = rest.indexOf("--fixture");
  const fixture = fixtureIdx === -1 ? undefined : rest[fixtureIdx + 1];
  if (provider !== "amplitude" && provider !== "customerio") {
    console.error("usage: vanta marketing read <amplitude|customerio> [--fixture <json>]");
    return 1;
  }
  console.log(formatMarketing(await readMarketing({ provider, fixture })));
  return 0;
}
