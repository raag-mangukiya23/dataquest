// Ctrl/⌘ + K: jump to any page or career.
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, CornerDownLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { catalog } from '@/api/endpoints'
import { useSession } from '@/state/session'
import { sectorLabel } from '@/lib/format'
import { navFor } from './nav'

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return { open, setOpen }
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const { primary, secondary } = navFor(user?.role)
  const careers = useQuery({ queryKey: ['careers', 'all'], queryFn: () => catalog.careers({ page_size: 100 }), enabled: open, staleTime: 10 * 60_000 })
  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }
  const item = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm aria-selected:bg-surface-2'
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl bg-surface shadow-lift hairline">
          <DialogPrimitive.Title className="sr-only">Search PRISM</DialogPrimitive.Title>
          <Command label="Search PRISM" loop>
            <Command.Input autoFocus placeholder="Search careers, pages…" className="h-14 w-full border-b border-[rgb(var(--line)/var(--line-alpha))] bg-transparent px-4 text-base outline-none placeholder:text-muted" />
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">Nothing found.</Command.Empty>
              <Command.Group heading="Go to" className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {[...primary, ...secondary].map((i) => (
                  <Command.Item key={i.to} value={`page ${i.label}`} onSelect={() => go(i.to)} className={item}>
                    <i.icon className="h-4 w-4 text-muted" aria-hidden />
                    <span className="flex-1 text-ink">{i.label}</span>
                    <CornerDownLeft className="h-3.5 w-3.5 text-muted" aria-hidden />
                  </Command.Item>
                ))}
              </Command.Group>
              {careers.data && (
                <Command.Group heading="Careers" className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                  {careers.data.items.map((c) => (
                    <Command.Item key={c.id} value={`career ${c.name} ${sectorLabel(c.sector)}`} onSelect={() => go(`/explore/${c.slug}`)} className={item}>
                      <Briefcase className="h-4 w-4 text-muted" aria-hidden />
                      <span className="flex-1 text-ink">{c.name}</span>
                      <span className="text-xs text-muted">{sectorLabel(c.sector)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
