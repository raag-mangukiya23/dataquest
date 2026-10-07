import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { MotionConfig } from 'motion/react'
import App from './App'
import './index.css'
import { isRetryable } from '@/api/client'
import { SessionProvider } from '@/state/session'
import { SettingsProvider, useSettings } from '@/state/settings'
import { ToastProvider } from '@/components/ui'
import { clearChunkReloadFlag, reloadOnceForChunk } from '@/components/shell/PageErrorBoundary'

// After a new deploy, old page files are gone; reload once to fetch the new version instead of showing a blank page.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadOnceForChunk()) e.preventDefault()
})
window.addEventListener('load', () => setTimeout(clearChunkReloadFlag, 10_000))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retry network trouble and server errors (with backoff), never a 4xx answer.
      retry: (count, err) => isRetryable(err) && count < 2,
      retryDelay: (n) => Math.min(800 * 2 ** n, 4000),
    },
    mutations: { retry: false },
  },
})

function Motion({ children }: { children: React.ReactNode }) {
  const { reducedMotion } = useSettings()
  return <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>{children}</MotionConfig>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <Motion>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <SessionProvider>
              <TooltipPrimitive.Provider delayDuration={150}>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </TooltipPrimitive.Provider>
            </SessionProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </Motion>
    </SettingsProvider>
  </StrictMode>,
)
