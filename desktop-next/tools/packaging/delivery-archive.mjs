import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fingerprintInputs } from "./package-provenance.mjs";
import { assertExpectedBuild } from "./build-identity.mjs";

const isDigest = (value) => /^[a-f0-9]{64}$/.test(value);

function validProvenance(build) {
  const provenance = build?.provenance;
  if (!provenance || provenance.schema !== 1) return false;
  return /^[a-f0-9]{40}$/.test(provenance.fullCommit) && build.commit === provenance.fullCommit.slice(0, 8)
    && typeof provenance.dirty === "boolean" && isDigest(provenance.source?.sha256) && isDigest(provenance.assembly?.sha256);
}

function publishArchive({ archive, pendingReport, reportPath, report, temporary }) {
  const previousZip = path.join(temporary, "previous.zip");
  const previousReport = path.join(temporary, "previous-report.json");
  const existed = fs.existsSync(report.zip);
  fs.copyFileSync(reportPath, previousReport);
  if (existed) fs.copyFileSync(report.zip, previousZip);
  try {
    fs.renameSync(archive, report.zip);
    fs.renameSync(pendingReport, reportPath);
  } catch (error) {
    if (existed) fs.copyFileSync(previousZip, report.zip);
    else fs.rmSync(report.zip, { force: true });
    fs.copyFileSync(previousReport, reportPath);
    throw error;
  }
}

/** Validate paths/identity before contacting Apple or replacing any delivery artifact. */
export function deliveryReport(app, { run = execFileSync } = {}) {
  const reportPath = path.join(path.dirname(app), "bundle-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const build = JSON.parse(fs.readFileSync(path.join(app, "Contents", "Resources", "vanta-build-provenance.json"), "utf8"));
  if (path.resolve(report.app) !== app || !report.build || JSON.stringify(report.build) !== JSON.stringify(build)
    || !validProvenance(build)) {
    throw new Error("Missing or mismatched package source provenance; rebuild from the authoritative Git checkout.");
  }
  const expected = `${path.basename(app, ".app").replace(/ /g, "-")}-${build.version}-arm64.zip`;
  if (path.dirname(path.resolve(report.zip)) !== path.dirname(app) || path.basename(report.zip) !== expected) {
    throw new Error("Delivery archive path must match this app and build in its release directory.");
  }
  assertExpectedBuild({ candidate: app, expectedCommit: build.commit, run });
  return { reportPath, report };
}

/** Called only after successful staple, staple validation and platform assessment. */
export function refreshDeliveryArchive(app, { run = execFileSync, now = () => new Date().toISOString() } = {}) {
  const { reportPath, report } = deliveryReport(app, { run });
  const temporary = fs.mkdtempSync(path.join(path.dirname(app), ".vanta-delivery-"));
  const extracted = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-archive-proof-"));
  const archive = path.join(temporary, "delivery.zip");
  try {
    run("xcrun", ["stapler", "validate", app], { stdio: "inherit" });
    const before = fingerprintInputs({ app });
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, archive]);
    run("ditto", ["-x", "-k", archive, extracted]);
    const archivedApp = path.join(extracted, path.basename(app));
    run("xcrun", ["stapler", "validate", archivedApp], { stdio: "inherit" });
    run("codesign", ["--verify", "--deep", "--strict", archivedApp], { stdio: "inherit" });
    if (before.sha256 !== fingerprintInputs({ app: archivedApp }).sha256 || before.sha256 !== fingerprintInputs({ app }).sha256) {
      throw new Error("Delivery archive does not match the final stapled app; previous archive preserved.");
    }
    const sha256 = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
    const finalReport = { ...report, zipMb: Math.round(fs.statSync(archive).size / 1048576), delivery: {
      status: "notarized-archive-verified", archivedAt: now(), sha256, appSha256: before.sha256,
      bytes: fs.statSync(archive).size, sourceSha256: report.build.provenance.source.sha256,
    } };
    const pendingReport = path.join(temporary, "bundle-report.json");
    fs.writeFileSync(pendingReport, `${JSON.stringify(finalReport, null, 2)}\n`);
    // Keep prior products until every archive/readback check has passed.
    publishArchive({ archive, pendingReport, reportPath, report, temporary });
    return finalReport.delivery;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(extracted, { recursive: true, force: true });
  }
}
