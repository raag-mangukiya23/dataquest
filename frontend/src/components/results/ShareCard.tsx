// "Share my spectrum card": a prism-styled PNG with the Holland code and the top three career names only.
// Never money, family data or scores.
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useRef, useState } from 'react'
import { profile } from '@/api/endpoints'
import type { Recommendation } from '@/api/types'
import { Button, Dialog, Skeleton, useToast } from '@/components/ui'
import { sectorLabel } from '@/lib/format'

const RIASEC: Record<string, string> = {
  R: 'Realistic',
  I: 'Investigative',
  A: 'Artistic',
  S: 'Social',
  E: 'Enterprising',
  C: 'Conventional',
}
// The brand spectrum (fixed hex, so the PNG looks the same in either theme).
const RAYS = ['#7C6CFF', '#3B8BFF', '#14B8A6', '#65C23A', '#F2B01E', '#F0544F']

function PrismMark() {
  return (
    <svg viewBox="0 0 320 120" className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="share-beam" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="share-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00E5FF" stopOpacity="0.28" />
          <stop offset="1" stopColor="#8B7CFF" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <line x1="0" y1="66" x2="128" y2="62" stroke="url(#share-beam)" strokeWidth="3" strokeLinecap="round" />
      {RAYS.map((c, i) => (
        <line key={c} x1="170" y1="60" x2="320" y2={22 + i * 15} stroke={c} strokeWidth="3" strokeLinecap="round" opacity="0.95" />
      ))}
      <path d="M150 14 L190 96 L110 96 Z" fill="url(#share-glass)" stroke="#00E5FF" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function ShareCardDialog({ open, onOpenChange, studentId, top, firstName }: { open: boolean; onOpenChange: (v: boolean) => void; studentId: string; top: Recommendation[]; firstName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // Holland code: optional. A parent without the student's consent gets an error; the card simply skips it.
  const traits = useQuery({ queryKey: ['traits', studentId], queryFn: () => profile.traits(studentId), enabled: open, retry: false, staleTime: 5 * 60_000 })
  const code = traits.data?.top_riasec_code?.toUpperCase()

  async function download() {
    if (!ref.current) return
    setBusy(true)
    try {
      const { toPng } = await import('html-to-image')
      // html-to-image reports the cross-origin Google Fonts sheet it cannot read (it still embeds the fonts);
      // keep those expected notes out of the console while the picture is made.
      const original = console.error
      console.error = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && /remote css|reading CSS rules|remote stylesheet/i.test(args[0])) return
        original(...args)
      }
      let url: string
      try {
        url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true, backgroundColor: '#07080D' })
      } catch {
        url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true, backgroundColor: '#07080D', skipFonts: true })
      } finally {
        console.error = original
      }
      const a = document.createElement('a')
      a.href = url
      a.download = 'my-prism-spectrum.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast('ok', 'Your spectrum card was saved.')
    } catch {
      toast('error', 'Could not make the picture on this device. Try a screenshot instead.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share my spectrum card" description="Your Holland code and top three careers. No money, family details or scores are included.">
      <div className="mx-auto w-full max-w-[380px]">
        <div
          ref={ref}
          className="relative overflow-hidden rounded-[20px] p-6"
          style={{ background: 'radial-gradient(120% 80% at 0% 0%, #1b1640 0%, #07080D 55%), #07080D', color: '#ECEEF5', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          <div aria-hidden style={{ position: 'absolute', right: -60, bottom: -60, width: 200, height: 200, borderRadius: 999, background: 'rgba(0,229,255,.12)', filter: 'blur(40px)' }} />
          <div className="relative flex items-center justify-between">
            <span style={{ fontFamily: '"Bricolage Grotesque", Inter, sans-serif', fontWeight: 800, letterSpacing: '0.18em', fontSize: 15 }}>PRISM</span>
            <span style={{ fontSize: 11, color: '#8A90A6', letterSpacing: '0.12em', textTransform: 'uppercase' }}>My spectrum</span>
          </div>
          <div className="relative mt-4">
            <PrismMark />
          </div>
          {traits.isLoading ? (
            <Skeleton className="mt-4 h-14 w-40" />
          ) : code ? (
            <div className="relative mt-4">
              <div style={{ fontSize: 11, color: '#8A90A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{firstName ? `${firstName}'s Holland code` : 'Holland code'}</div>
              <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 44, fontWeight: 600, letterSpacing: '0.12em', lineHeight: 1.1 }}>{code}</div>
              <div style={{ fontSize: 12, color: '#B9BED0' }}>{code.split('').map((l) => RIASEC[l] ?? l).join(' · ')}</div>
            </div>
          ) : firstName ? (
            <div className="relative mt-4" style={{ fontSize: 22, fontWeight: 700 }}>{firstName}'s paths</div>
          ) : null}
          <div className="relative mt-5" style={{ fontSize: 11, color: '#8A90A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Top three paths
          </div>
          <ol className="relative mt-2 space-y-2">
            {top.slice(0, 3).map((r, i) => (
              <li key={r.career.id} className="flex items-center gap-3" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '10px 12px' }}>
                <span style={{ width: 8, height: 28, borderRadius: 4, background: 'linear-gradient(#00E5FF, #8B7CFF)', opacity: 1 - i * 0.2 }} />
                <span className="min-w-0">
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 16 }}>{r.career.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#8A90A6' }}>{sectorLabel(r.career.sector)}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="relative mt-5" style={{ fontSize: 11, color: '#8A90A6' }}>
            See every path. Choose yours together.
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button icon={<Download className="h-4 w-4" aria-hidden />} loading={busy} onClick={() => void download()}>
          Download PNG
        </Button>
      </div>
    </Dialog>
  )
}
