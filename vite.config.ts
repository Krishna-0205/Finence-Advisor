import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
try {
  process.loadEnvFile?.(".env");
} catch {}

export default defineConfig({
  plugins: [tanstackStart(), react(), tailwind()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
    strictPort: true,
  },
});
