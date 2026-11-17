// Shipped seed for the MCP package guard: packages publicly reported as malicious,
// typosquats of well-known packages, or specific compromised releases.
//
// This is a SEED, not a feed. Vanta never fetches an advisory list, so it only
// knows what is written here plus the owner's own file (see package-guard.ts).
// Every entry cites the public incident it comes from in `reason`. Add to it with a
// pull request that names the incident, or put local additions in the user file.
//
// An entry with `versions` denies only those exact releases; without it the whole
// package name is denied.

import type { DenyListFile } from "./package-guard.js";

export const SHIPPED_DENY_LIST: DenyListFile = {
  version: 1,
  packages: [
    {
      ecosystem: "npm",
      name: "postmark-mcp",
      reason: "impersonated the Postmark MCP server; release 1.0.16 (Sep 2025) BCC'd every email to an attacker address",
    },
    {
      ecosystem: "npm",
      name: "event-stream",
      versions: ["3.3.6"],
      reason: "release 3.3.6 (Nov 2018) pulled in the malicious flatmap-stream dependency, which targeted bitcoin wallets",
    },
    {
      ecosystem: "npm",
      name: "flatmap-stream",
      reason: "malicious dependency injected into event-stream 3.3.6 (Nov 2018)",
    },
    {
      ecosystem: "npm",
      name: "ua-parser-js",
      versions: ["0.7.29", "0.8.0", "1.0.0"],
      reason: "releases published from a hijacked maintainer account (Oct 2021) ran a preinstall script that installed a cryptominer and credential stealer",
    },
    {
      ecosystem: "npm",
      name: "crossenv",
      reason: "typosquat of cross-env (Aug 2017) that posted environment variables to an attacker server",
    },
    {
      ecosystem: "npm",
      name: "babelcli",
      reason: "typosquat of babel-cli from the same Aug 2017 campaign as crossenv, removed by npm",
    },
    {
      ecosystem: "npm",
      name: "mongose",
      reason: "typosquat of mongoose from the same Aug 2017 campaign as crossenv, removed by npm",
    },
    {
      ecosystem: "npm",
      name: "ffmepg",
      reason: "typosquat of ffmpeg from the same Aug 2017 campaign as crossenv, removed by npm",
    },
    {
      ecosystem: "pypi",
      name: "jeilyfish",
      reason: "typosquat of jellyfish (capital I for l, Dec 2019) that tried to steal SSH and GPG keys",
    },
    {
      ecosystem: "pypi",
      name: "python3-dateutil",
      reason: "typosquat of python-dateutil (Dec 2019) that imported the malicious jeilyfish package",
    },
  ],
};
