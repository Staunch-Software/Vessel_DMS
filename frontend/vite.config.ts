import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Backend API target. Defaults to the documented port 8010; override locally
// with DMS_API_TARGET (e.g. http://localhost:8020) without touching this file.
const apiTarget = process.env.DMS_API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
    },
  },
});
