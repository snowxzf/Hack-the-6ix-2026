import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Auth0 SPA callbacks are registered for http://localhost:5173 —
    // never let Vite hop to another port (callback mismatch).
    port: 5173,
    strictPort: true,
    // Allow importing the optimizer package from the repo root.
    fs: { allow: [".."] },
  },
});
