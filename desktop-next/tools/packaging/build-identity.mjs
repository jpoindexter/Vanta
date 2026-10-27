import fs from "node:fs";
import path from "node:path";

function expectedBuildReport(candidate, expectedCommit) {
  let report;
  try { report = JSON.parse(fs.readFileSync(path.join(path.dirname(candidate), "bundle-report.json"), "utf8")); }
  catch { throw new Error("No readable build report. Rebuild Vanta before installing."); }
  if (typeof report?.app !== "string" || path.resolve(report.app) !== candidate) {
    throw new Error("The build report does not name this candidate. Rebuild Vanta before installing.");
  }
  if (report?.build?.commit !== expectedCommit) {
    throw new Error("The packaged app does not match the expected source. Rebuild Vanta before installing.");
  }
  const version = report.build.version;
  if (typeof version !== "string" || !version.trim() || version.length > 128) {
    throw new Error("The build report has no valid version. Rebuild Vanta before installing.");
  }
  return report.build;
}

/** The report and signed bundle must name the source requested by the installer. */
export function assertExpectedBuild({ candidate, expectedCommit, run }) {
  if (typeof expectedCommit !== "string" || !/^[a-f0-9]{8,40}$/.test(expectedCommit)) {
    throw new Error("A verified expected source commit is required before installation.");
  }
  const build = expectedBuildReport(candidate, expectedCommit);
  const read = key => run("plutil", ["-extract", key, "raw", path.join(candidate, "Contents", "Info.plist")], { encoding: "utf8" }).trim();
  if (read("CFBundleIdentifier") !== "studio.theft.vanta-next") {
    throw new Error("Candidate or installed app has the wrong Vanta bundle identifier.");
  }
  for (const [key, value] of Object.entries({ VantaBuildCommit: expectedCommit,
    CFBundleShortVersionString: build.version, CFBundleVersion: build.version })) {
    if (read(key) !== value) {
      throw new Error("The bundle metadata does not match the expected source/build report. Rebuild Vanta before installing.");
    }
  }
}
