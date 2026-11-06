/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Demo-login passwords injected by vite.config.ts in development; null in production builds. */
declare const __DEMO_PASSWORDS__: { admin: string; fleet: string; warehouse: string; storekeeper: string } | null;
