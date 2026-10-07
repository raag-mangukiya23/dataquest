// Invite a family member: big code, browser-made QR code, WhatsApp share and copy.
import { useMutation } from '@tanstack/react-query'
import { Check, Copy, QrCode, UserPlus } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { family } from '@/api/endpoints'
import type { InviteOut } from '@/api/types'
import { Button, Card, ErrorState, Skeleton, useToast } from '@/components/ui'
import { formatDate } from '@/lib/format'

export function joinLink(code: string) {
  return `${window.location.origin}/family?code=${encodeURIComponent(code)}`
}
export function whatsappHref(code: string, forParent: boolean) {
  const msg = forParent
    ? `Hi! I am using PRISM to plan my career. Please join our family on PRISM so you can approve and see my results. Our family code is ${code}. Open: ${joinLink(code)}`
    : `Join our family on PRISM to plan careers together. Our family code is ${code}. Open: ${joinLink(code)}`
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

export function InvitePanel({ forParent = false, autoCreate = false, title = 'Invite family' }: { forParent?: boolean; autoCreate?: boolean; title?: string }) {
  const toast = useToast()
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inv = useMutation<InviteOut>({ mutationFn: () => family.invite() })

  useEffect(() => {
    if (autoCreate && inv.isIdle) inv.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate])

  const code = inv.data?.invite_code
  useEffect(() => {
    if (!code) return
    let live = true
    QRCode.toDataURL(joinLink(code), { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0B0D14', light: '#FFFFFF' } })
      .then((u) => live && setQr(u))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [code])

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast('info', `Your code is ${code}`)
    }
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
          <UserPlus className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-muted">
        {forParent ? 'Send this code to your parent. They sign up as a parent and type it in.' : 'Share a one-time code. The other person types it in after signing up.'}
      </p>

      {inv.isIdle && (
        <Button className="mt-4 w-full sm:w-auto" icon={<QrCode className="h-4 w-4" />} onClick={() => inv.mutate()}>
          Make an invite code
        </Button>
      )}
      {inv.isPending && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]" aria-busy="true">
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="mx-auto h-36 w-36" />
        </div>
      )}
      {inv.isError && (
        <div className="mt-4">
          <ErrorState error={inv.error} onRetry={() => inv.mutate()} title="Could not make a code" />
        </div>
      )}
      {inv.data && (
        <div className="mt-4 grid items-center gap-5 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">Family code</div>
            <div className="mt-1 flex items-center gap-2">
              <output aria-label={`Family code ${code?.split('').join(' ')}`} className="num select-all break-all font-mono text-3xl font-bold tracking-[0.18em] text-ink sm:text-4xl">
                {code}
              </output>
              <button type="button" onClick={copy} aria-label="Copy code" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hairline hover:text-ink">
                {copied ? <Check className="h-5 w-5 text-ok" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Works until {formatDate(inv.data.expires_at)} · up to {inv.data.max_uses} people
            </p>
            <a
              href={whatsappHref(inv.data.invite_code, forParent)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-white hover:brightness-110"
              style={{ background: '#1FA855' }}
            >
              <WhatsAppGlyph /> Share on WhatsApp
            </a>
          </div>
          <div className="mx-auto">
            {qr ? (
              <img src={qr} alt={`QR code that opens the join page with code ${code}`} className="h-36 w-36 rounded-xl bg-white p-1.5 sm:h-40 sm:w-40" />
            ) : (
              <Skeleton className="h-36 w-36" />
            )}
            <p className="mt-1.5 text-center text-xs text-muted">Scan with a phone camera</p>
          </div>
        </div>
      )}
    </Card>
  )
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  )
}
