import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'fs';

// Unique per build — used by the client to detect it's running stale code
// and force a clean reload automatically, without needing the user to
// manually clear their browser's cache.
const BUILD_ID = Date.now().toString();

// Writes build-version.json into the final dist/ output, containing the
// SAME BUILD_ID baked into the client bundle via `define` below. The
// client periodically fetches this file (cache-busted) and compares it to
// its own embedded value — a mismatch means a newer version has been
// deployed since this tab loaded, and the app force-reloads itself.
function writeBuildVersionPlugin() {
  return {
    name: 'write-build-version',
    writeBundle(options: { dir?: string }) {
      const outDir = options.dir || 'dist';
      writeFileSync(`${outDir}/build-version.json`, JSON.stringify({ buildId: BUILD_ID }));
    },
  };
}

export default defineConfig({
  plugins: [react(), writeBuildVersionPlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  // lucide-react must be pre-bundled — excluding it makes Vite serve 1000+ separate
  // icon requests which the preview proxy rate-limits with 429s.
  optimizeDeps: {
    include: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'charts';
          }
          if (id.includes('node_modules/xlsx')) {
            return 'xlsx';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
    minify: 'esbuild',
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    historyApiFallback: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    historyApiFallback: true,
  },
});
