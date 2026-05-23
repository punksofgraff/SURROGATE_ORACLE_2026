/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Stamped at build time — base-36 epoch. Changes every restart/rebuild. */
  readonly VITE_BUILD_ID: string;
  // Add other VITE_ vars here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
