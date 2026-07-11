import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
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
          if (id.includes('/components/admin/')) {
            return 'admin-components';
          }
          if (id.includes('/components/AdminDashboard')) {
            return 'admin-components';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
    minify: 'esbuild',
  },
  server: {
    historyApiFallback: true,
  },
  preview: {
    historyApiFallback: true,
  },
});
