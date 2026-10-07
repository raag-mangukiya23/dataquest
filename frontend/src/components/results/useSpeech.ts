// Read-aloud with the browser's speech synthesis. Returns null when the browser has no voice for the language,
// so callers can hide the button instead of offering something that will not work.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@/api/endpoints'

const BCP47: Record<Lang, string> = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' }

function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  const want = BCP47[lang].toLowerCase()
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase()
  return voices.find((v) => norm(v) === want) ?? voices.find((v) => norm(v).split('-')[0] === lang) ?? null
}

export function useSpeech(lang: Lang) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const utter = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (!supported) return
    const load = () => setVoice(pickVoice(window.speechSynthesis.getVoices(), lang))
    load()
    window.speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load)
  }, [lang, supported])

  // stop talking when the screen goes away or the language changes
  useEffect(() => {
    return () => {
      if (supported && utter.current) window.speechSynthesis.cancel()
    }
  }, [lang, supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string) => {
      if (!supported || !voice) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = BCP47[lang]
      u.rate = 0.95
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      utter.current = u
      setSpeaking(true)
      window.speechSynthesis.speak(u)
    },
    [lang, supported, voice],
  )

  return { available: supported && !!voice, speaking, speak, stop }
}
