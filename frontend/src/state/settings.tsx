// Comfort settings, remembered per device: theme, text size, reduced motion, language, parent mode.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lang } from '@/api/endpoints'

export interface Settings {
  theme: 'system' | 'dark' | 'light'
  textSize: 100 | 115 | 130
  reduceMotion: boolean
  language: Lang
  /** null = automatic (on for parents on phones) */
  parentMode: boolean | null
  tourDone: boolean
}

const DEFAULTS: Settings = { theme: 'system', textSize: 100, reduceMotion: false, language: 'en', parentMode: null, tourDone: false }
const KEY = 'prism-settings'

function load(): Settings {
  try {
    // The app is English only; ignore a language saved by an older version.
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>), language: 'en' }
  } catch {
    return DEFAULTS
  }
}

interface Ctx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  /** true when either the OS or the in-app toggle asks for reduced motion */
  reducedMotion: boolean
}
const SettingsContext = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load)
  const [osReduce, setOsReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setOsReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* private mode */
    }
    const root = document.documentElement
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#07080D' : '#F6F7FB')
    }
    apply()
    root.style.fontSize = `${settings.textSize}%`
    root.lang = settings.language === 'en' ? 'en' : settings.language
    if (settings.reduceMotion) root.dataset.motion = 'reduce'
    else delete root.dataset.motion
    const mq = matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings])

  const value = useMemo<Ctx>(
    () => ({
      settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      reducedMotion: osReduce || settings.reduceMotion,
    }),
    [settings, osReduce],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings outside SettingsProvider')
  return ctx
}
