import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "studio.theft.vanta",
  appName: "Vanta",
  webDir: "desktop-app/dist",
  server: { iosScheme: "capacitor" },
};

export default config;
