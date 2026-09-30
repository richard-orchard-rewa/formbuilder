/// <reference types="vitest" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// The portal stands in for the session-notes system that embeds forms. It
// reaches the Data Binding Service only through this relay (/dbs/...), the
// way a real session-notes backend would -- never ICIS directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      // form-builder's server: published session templates come from it, and
      // completed notes are stored in it.
      "/fb": {
        target: process.env.FORM_BUILDER_URL ?? "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/fb/, ""),
      },
      "/dbs": {
        target: process.env.BINDING_SERVICE_URL ?? "http://localhost:3100",
        rewrite: (path) => path.replace(/^\/dbs/, ""),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
})
