import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defaultClientConditions, defineConfig, loadEnv, type PluginOption } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Grouping strategy: keep React + router together (loaded on every route),
// peel off ecosystems that change independently so a heavy library update
// invalidates only its own chunk hash.
const VENDOR_GROUPS: Record<string, string[]> = {
  react: ["react", "react-dom", "react-router"],
  query: ["@tanstack/react-query", "@tanstack/react-table"],
  i18n: ["i18next", "react-i18next", "i18next-browser-languagedetector"],
  form: ["react-hook-form", "zod", "@hookform/resolvers"],
  ui: [
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-slot",
    "cmdk",
    "lucide-react",
    "sonner",
  ],
};

function classifyVendor(moduleId: string): string | undefined {
  if (!moduleId.includes("node_modules")) return undefined;
  for (const [chunkName, packageNames] of Object.entries(VENDOR_GROUPS)) {
    for (const pkg of packageNames) {
      if (moduleId.includes(`node_modules/${pkg}/`) || moduleId.includes(`node_modules/.pnpm/${pkg}@`)) {
        return chunkName;
      }
    }
  }
  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, dirname, "");
  const apiTarget = env.VITE_SERVER_URL || "http://localhost:3000";

  const plugins: PluginOption[] = [react(), tailwindcss()];

  if (mode === "analyze") {
    plugins.push(
      visualizer({
        brotliSize: true,
        filename: "dist/stats.html",
        gzipSize: true,
        open: false,
        template: "treemap",
      }) as PluginOption,
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
      },
      conditions: ["@otd/source", ...defaultClientConditions],
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        "/api": { changeOrigin: true, target: apiTarget },
      },
    },
    preview: {
      host: true,
      port: 4173,
      proxy: {
        "/api": { changeOrigin: true, target: apiTarget },
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      sourcemap: mode === "production" ? "hidden" : true,
      rollupOptions: {
        output: {
          manualChunks: classifyVendor,
        },
      },
    },
  };
});
