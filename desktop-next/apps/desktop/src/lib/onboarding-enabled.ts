export function isOnboardingEnabled(): boolean {
  return window.desktopBridge?.guestOnboardingEnabled === true
}
