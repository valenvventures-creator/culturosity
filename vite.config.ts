import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const apiPort = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  preview: { port: 4173, proxy: { "/api": { target: `http://127.0.0.1:${apiPort}` } } },
  build: { sourcemap: false, target: "es2022", chunkSizeWarningLimit: 900 },
});
