import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative base so the build works from any static host / sub-path.
  base: "./",
  plugins: [react(), tailwindcss()],
  // The Firebase SDK alone is ~550 kB; it is already split into its own chunk.
  build: { chunkSizeWarningLimit: 600 },
});
