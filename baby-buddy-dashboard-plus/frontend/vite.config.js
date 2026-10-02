import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// The add-on manifest is the release source of truth, also for the settings UI.
const manifest = readFileSync(new URL("../config.yaml", import.meta.url), "utf8");
const appVersion = manifest.match(/^version:\s*["']?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)["']?\s*$/m)?.[1];
if (!appVersion) throw new Error("Missing release version in config.yaml");

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:8099",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    globals: true,
  },
});
