import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateTrust04HostLedger } from "./lib/trust-04-host-ledger.mjs";

const root = process.cwd();
const path = resolve(root, "../docs/trust-04-host-ledger-2026-08-02.json");
const ledger = JSON.parse(await readFile(path, "utf8"));
console.log(JSON.stringify(await validateTrust04HostLedger(root, ledger)));
