import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build --mode single` inlines everything into one HTML file that can be
// opened straight from disk (file://), like the original tracker.
export default defineConfig(({ mode }) => ({
  // Relative base so the build works from any static host / sub-path.
  base: "./",
  plugins: [react(), tailwindcss(), ...(mode === "single" ? [viteSingleFile()] : [])],
  build:
    mode === "single"
      ? { outDir: "dist-single", chunkSizeWarningLimit: 4000 }
      : // The Firebase SDK alone is ~550 kB; it is already split into its own chunk.
        { chunkSizeWarningLimit: 600 },
}));
