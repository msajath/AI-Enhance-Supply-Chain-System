import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables from the repository root .env
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');

  // Quick demo logins on the sign-in page (development only). The passwords come from the
  // same SEED_PASSWORD_* values the seed script uses, so the buttons always match the database.
  // In a production build this is null and the demo panel is not shown.
  const demoPasswords = mode === 'development' ? {
    admin: env.SEED_PASSWORD_ADMIN ?? '',
    fleet: env.SEED_PASSWORD_FLEET ?? '',
    warehouse: env.SEED_PASSWORD_WAREHOUSE_CEN ?? '',
    storekeeper: env.SEED_PASSWORD_STOREKEEPER_MAT ?? '',
  } : null;

  return {
    define: { __DEMO_PASSWORDS__: JSON.stringify(demoPasswords) },
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:4000',
          changeOrigin: true,
        },
        '/health': {
          target: env.VITE_API_BASE_URL || 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
