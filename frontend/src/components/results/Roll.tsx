// Mount-time number roll-up for the results screens.
import { animate } from 'motion/react'
import { useEffect, useState } from 'react'
import { useSettings } from '@/state/settings'

/**
 * A number that rolls up once on mount (not on scroll-into-view), so content further down the page is never
 * stuck at 0 for a reader who jumps, prints or screenshots. Reduced motion shows the value at once.
 */
export function Roll({ value, decimals = 0, suffix = '', className, delay = 0 }: { value: number; decimals?: number; suffix?: string; className?: string; delay?: number }) {
  const { reducedMotion } = useSettings()
  const [shown, setShown] = useState(reducedMotion ? value : 0)
  useEffect(() => {
    if (reducedMotion) return setShown(value)
    const ctl = animate(0, value, { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1], onUpdate: setShown })
    return () => ctl.stop()
  }, [value, reducedMotion, delay])
  return (
    <span className={'num ' + (className ?? '')}>
      <span aria-hidden>
        {shown.toFixed(decimals)}
        {suffix}
      </span>
      <span className="sr-only">
        {value.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  )
}
