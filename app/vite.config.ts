import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow importing the optimizer package from the repo root.
    fs: { allow: [".."] },
  },
});
