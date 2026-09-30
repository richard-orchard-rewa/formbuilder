/// <reference types="vitest" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { notesApi } from "./server/notes-api"

// The portal stands in for the session-notes system that embeds forms. It
// reaches the Data Binding Service only through this relay (/dbs/...), the
// way a real session-notes backend would -- never ICIS directly -- and
// keeps its session notes in its own Postgres database (/api/notes).
export default defineConfig({
  plugins: [react(), notesApi()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
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
