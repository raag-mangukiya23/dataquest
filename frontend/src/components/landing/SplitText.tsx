// Split-text reveal: each word rises out of its own mask, staggered. Screen readers get the plain sentence.
import { motion, type Variants } from 'motion/react'
import { Fragment, type ElementType } from 'react'
import { useSettings } from '@/state/settings'
import { cx } from '@/components/ui'

const SPECTRUM = 'linear-gradient(90deg, rgb(var(--fit)), rgb(var(--market)), rgb(var(--afford)), rgb(var(--roi)), rgb(var(--family)), rgb(var(--disrupt)))'
const EASE = [0.22, 1, 0.36, 1] as const

export interface SplitLine {
  text: string
  /** paint the line with the six-colour spectrum (continuous across its words) */
  spectrum?: boolean
  className?: string
}

export function SplitText({
  lines,
  as: As = 'h1',
  className,
  delay = 0,
  stagger = 0.055,
  inView = false,
}: {
  lines: SplitLine[]
  as?: ElementType
  className?: string
  delay?: number
  stagger?: number
  /** start when scrolled into view instead of on mount */
  inView?: boolean
}) {
  const { reducedMotion } = useSettings()
  const word: Variants = {
    hidden: { y: '108%' },
    show: (i: number) => ({ y: '0%', transition: { delay: (inView ? 0 : delay) + i * stagger, duration: 0.7, ease: EASE } }),
  }
  // Hero headlines rise word by word on mount. Below-the-fold headings (inView) render readable at once, never hidden.
  const trigger = reducedMotion || inView ? { initial: false as const } : { initial: 'hidden', animate: 'show' }
  let n = 0
  return (
    <As className={className}>
      <span className="sr-only">{lines.map((l) => l.text).join(' ')}</span>
      <motion.span aria-hidden className="block" {...trigger}>
        {lines.map((line, li) => {
          const words = line.text.split(/\s+/).filter(Boolean)
          return (
            <span key={li} className={cx('block', line.className)}>
              {words.map((w, wi) => {
                const i = n++
                const style = line.spectrum
                  ? {
                      backgroundImage: SPECTRUM,
                      backgroundSize: `${words.length * 100}% 100%`,
                      backgroundPosition: `${words.length > 1 ? (wi / (words.length - 1)) * 100 : 0}% 0`,
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }
                  : undefined
                return (
                  <Fragment key={wi}>
                    <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
                      <motion.span className="inline-block" style={style} variants={word} custom={i}>
                        {w}
                      </motion.span>
                    </span>
                    {wi < words.length - 1 && ' '}
                  </Fragment>
                )
              })}
            </span>
          )
        })}
      </motion.span>
    </As>
  )
}
