function matchesOrigin(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}

function trustedMainFrame(webContents, details, options) {
  const window = options.getWindow();
  const origin = options.getOrigin();
  if (!window || window.isDestroyed() || webContents !== window.webContents) return false;
  if (webContents.isDestroyed() || details.isMainFrame !== true) return false;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return false;
  if (!matchesOrigin(webContents.getURL(), origin)) return false;
  return [details.requestingUrl, details.securityOrigin, details.embeddingOrigin]
    .filter((value) => value !== undefined)
    .every((value) => matchesOrigin(value, origin));
}

export function microphonePermissionCheck(webContents, permission, requestingOrigin, context) {
  const { details = {}, options } = context;
  if (!trustedMainFrame(webContents, details, options)) return false;
  if (!matchesOrigin(requestingOrigin, options.getOrigin())) return false;
  // Preserve the existing message Copy action without granting clipboard reads.
  if (permission === "clipboard-sanitized-write") return true;
  return permission === "media" && details.mediaType === "audio";
}

export function microphonePermissionRequest(webContents, permission, context) {
  const { details = {}, options } = context;
  if (!trustedMainFrame(webContents, details, options)) return false;
  if (!matchesOrigin(details.requestingUrl, options.getOrigin())) return false;
  if (permission === "clipboard-sanitized-write") return true;
  if (permission !== "media" || !Array.isArray(details.mediaTypes)) return false;
  return details.mediaTypes.length === 1 && details.mediaTypes[0] === "audio";
}

/** Register before any page loads; the getters follow window and port changes. */
export function installMicrophonePermissions(session, options) {
  session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
    microphonePermissionCheck(webContents, permission, requestingOrigin, { details, options }));
  session.setPermissionRequestHandler((webContents, permission, callback, details) =>
    callback(microphonePermissionRequest(webContents, permission, { details, options })));
}
