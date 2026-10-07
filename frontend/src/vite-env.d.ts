/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DATA_MODE?: 'api' | 'fixtures'
  readonly VITE_AUTH_MODE?: 'live' | 'mock'
  readonly VITE_DEV_TOOLS?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
interface Window {
  /** Set by the inline loading screen in index.html; React calls it once the app has rendered. */
  __prismReady?: () => void
}
