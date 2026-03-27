/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HRFLOW_API_KEY: string;
  readonly VITE_HRFLOW_USER_EMAIL: string;
  readonly VITE_HRFLOW_SOURCE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
