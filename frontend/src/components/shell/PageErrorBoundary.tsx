// Catches a page that fails to load or render, so one bad page shows a message instead of blanking the whole app.
import { Component, type ReactNode } from 'react'

const RELOADED = 'prism-chunk-reload'

/** A page's code file failed to download, usually because a new version was deployed or the network dropped. */
export function isChunkError(err: unknown) {
  return /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|ChunkLoadError/i.test(String((err as Error)?.message ?? err))
}

/** Reload once to pick up the new version; the flag stops a reload loop if the file is truly missing. */
export function reloadOnceForChunk() {
  try {
    if (sessionStorage.getItem(RELOADED)) return false
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    return false
  }
  window.location.reload()
  return true
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOADED)
  } catch {}
}

export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  componentDidCatch(error: unknown) {
    if (isChunkError(error)) reloadOnceForChunk()
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="text-lg font-semibold">This page didn't load</h2>
        <p className="mt-2 text-sm text-muted">Your connection may have dropped. Try again; nothing you entered is lost.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={() => this.setState({ error: null })} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-ink">Try again</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl px-4 py-2 text-sm font-medium hairline">Reload</button>
        </div>
      </div>
    )
  }
}
