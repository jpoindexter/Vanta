import { ensureVantaStore } from "../store/home.js";
import { activateProfileEnvironment } from "../profiles/store.js";
import { activateVaultEnvironment } from "../secrets/vault-manager.js";
import { defaultExec } from "../secrets/provider.js";

/** Create the home store and activate the profile and vault environments. */
export async function initializeStoreAndProfile(): Promise<void> {
  const baseHome = await ensureVantaStore();
  await activateProfileEnvironment(process.env);
  await activateVaultEnvironment(process.env, defaultExec);
  if (process.env.VANTA_HOME !== baseHome) await ensureVantaStore(process.env);
}
