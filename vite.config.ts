import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Inlines the JS bundle and CSS into index.html so the result is one file
 * that opens straight from disk (file://), like the original tracker.
 */
function singleFile(): Plugin {
  return {
    name: "single-file",
    enforce: "post",
    // Must run after Vite has filled in its own placeholders in the chunks.
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        const html = Object.values(bundle).find((f) => f.fileName.endsWith(".html"));
        if (!html || html.type !== "asset") return;
        let source = String(html.source);
        for (const [name, file] of Object.entries(bundle)) {
          const ref = new RegExp(`<(script|link)[^>]*?(src|href)="\\./${name.replace(/[.]/g, "\\.")}"[^>]*>(</script>)?`);
          if (!ref.test(source)) continue;
          if (file.type === "chunk") {
            // A literal "</script" inside the code would end the tag early.
            const code = file.code.replace(/<\/script/gi, "<\\/script");
            source = source.replace(ref, () => `<script type="module">${code}</script>`);
          } else if (name.endsWith(".css")) {
            source = source.replace(ref, () => `<style>${String(file.source)}</style>`);
          } else continue;
          delete bundle[name];
        }
        html.source = source;
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative base so the build works from any static host / sub-path.
  base: "./",
  plugins: [react(), tailwindcss(), ...(mode === "single" ? [singleFile()] : [])],
  build:
    mode === "single"
      ? {
          outDir: "dist-single",
          cssCodeSplit: false,
          // Everything is inline, so there is nothing to preload.
          modulePreload: false,
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          chunkSizeWarningLimit: 4000,
          rolldownOptions: { output: { codeSplitting: false } },
        }
      : // The Firebase SDK alone is ~550 kB; it is already split into its own chunk.
        { chunkSizeWarningLimit: 600 },
}));
