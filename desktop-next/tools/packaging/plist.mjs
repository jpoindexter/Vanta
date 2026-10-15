// Info.plist edits through plutil (ships with macOS), so values keep their plist types.
import { execFileSync } from "node:child_process";

const plutil = (...args) => execFileSync("plutil", args.map(String), { stdio: ["ignore", "pipe", "pipe"] });

/** Sets (or adds) a top-level key. Strings, booleans and numbers keep their plist type; objects and arrays go in as JSON. */
export function setKey(file, key, value) {
  if (typeof value === "string") plutil("-replace", key, "-string", value, file);
  else if (typeof value === "boolean") plutil("-replace", key, "-bool", value ? "YES" : "NO", file);
  else if (typeof value === "number") plutil("-replace", key, "-integer", value, file);
  else plutil("-replace", key, "-json", JSON.stringify(value), file);
}

export function removeKey(file, key) {
  try {
    plutil("-remove", key, file);
  } catch {
    // Already absent.
  }
}

/** The whole plist as an object. */
export function readPlist(file) {
  return JSON.parse(plutil("-convert", "json", "-o", "-", file).toString("utf8"));
}
