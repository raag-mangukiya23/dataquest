// Signed-in layout: sidebar on desktop, bottom bar + "More" sheet on phones, top bar with search, deadlines,
// language and account. Page changes get a thin spectrum wipe and a short fade.
import { motion } from 'motion/react'
import { LogOut, Menu, Moon, Search, Sun, Triangle } from 'lucide-react'
import { Suspense, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '@/state/session'
import { useSettings } from '@/state/settings'
import type { Lang } from '@/api/endpoints'
import { Dialog, PageSkeleton, cx } from '@/components/ui'
import { navFor, type NavItem } from './nav'
import { CommandPalette, useCommandPalette } from './CommandPalette'
import { DeadlineBell } from './DeadlineBell'
import { PageErrorBoundary } from './PageErrorBoundary'
import { Tour } from '@/components/system/Tour'

const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'hi', label: 'हिन्दी' },
]

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2" aria-label="PRISM home">
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-surface-2 hairline">
        <Triangle className="h-4 w-4 text-neon transition-transform duration-300 group-hover:rotate-180" strokeWidth={2.4} aria-hidden />
      </span>
      <span className="font-display text-lg font-extrabold tracking-[0.12em]">PRISM</span>
    </Link>
  )
}

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cx(
          'relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
          isActive ? 'text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="side-active" className="absolute inset-0 rounded-xl bg-surface-2 hairline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          {isActive && <span className="absolute left-0 top-2 h-6 w-[3px] rounded-r bg-neon" />}
          <Icon className="relative h-[18px] w-[18px]" aria-hidden />
          <span className="relative">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function ThemeToggle() {
  const { settings, update } = useSettings()
  const dark = document.documentElement.dataset.theme !== 'light'
  return (
    <button
      type="button"
      onClick={() => update({ theme: dark ? 'light' : 'dark' })}
      className="hidden h-10 w-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink sm:grid"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      data-theme-setting={settings.theme}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}

function LanguageSelect() {
  const { settings, update } = useSettings()
  return (
    <label className="relative hidden sm:block">
      <span className="sr-only">Language for summaries and reports</span>
      <select
        value={settings.language}
        onChange={(e) => update({ language: e.target.value as Lang })}
        className="h-10 appearance-none rounded-xl bg-transparent px-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink focus:outline-none"
      >
        {LANGS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function UserMenu() {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  if (!user) return null
  const initials = user.full_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-right leading-tight lg:block">
        <span className="block text-sm font-medium">{user.full_name}</span>
        <span className="block text-xs capitalize text-muted">{user.role === 'educator' ? 'counsellor' : user.role}</span>
      </span>
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">
        {initials}
      </span>
      <button
        type="button"
        onClick={() => {
          logout()
          navigate('/')
        }}
        className="hidden h-10 w-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink sm:grid"
        aria-label="Sign out"
      >
        <LogOut className="h-[18px] w-[18px]" />
      </button>
    </div>
  )
}

export function AppShell() {
  const { user } = useSession()
  const location = useLocation()
  const { reducedMotion } = useSettings()
  const { primary, secondary } = navFor(user?.role)
  const [moreOpen, setMoreOpen] = useState(false)
  const palette = useCommandPalette()
  const bottom = primary.slice(0, 4)
  const more = [...primary.slice(4), ...secondary]

  return (
    <div className="grain min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[rgb(var(--line)/var(--line-alpha))] bg-bg/80 px-4 py-5 backdrop-blur md:flex">
        <Logo to="/home" />
        <nav aria-label="Main" className="mt-8 flex-1 space-y-1 overflow-y-auto">
          {primary.map((i) => (
            <SideLink key={i.to} item={i} />
          ))}
          <div className="my-4 h-px bg-[rgb(var(--line)/var(--line-alpha))]" />
          {secondary.map((i) => (
            <SideLink key={i.to} item={i} />
          ))}
        </nav>
        <p className="px-3 text-[11px] leading-relaxed text-muted">Every number shows its source and whether it has been checked.</p>
      </aside>

      <div className="md:pl-64">
        {/* top bar */}
        <header className="no-print glass sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-[rgb(var(--line)/var(--line-alpha))] px-4 md:px-8">
          <div className="md:hidden">
            <Logo to="/home" />
          </div>
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            className="ml-auto hidden h-10 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm text-muted hairline hover:text-ink sm:inline-flex md:ml-0 md:w-72"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="flex-1 text-left">Search careers, pages…</span>
            <kbd className="num rounded bg-surface px-1.5 text-[11px] hairline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => palette.setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-surface-2 sm:hidden" aria-label="Search">
              <Search className="h-[18px] w-[18px]" />
            </button>
            <DeadlineBell />
            <LanguageSelect />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        {/* route-change spectrum wipe */}
        {!reducedMotion && (
          <motion.div
            key={`wipe-${location.pathname}`}
            aria-hidden
            className="no-print fixed left-0 top-0 z-40 h-[2px] w-full origin-left md:left-64 md:w-[calc(100%-16rem)]"
            style={{ background: 'linear-gradient(90deg, rgb(var(--fit)), rgb(var(--market)), rgb(var(--afford)), rgb(var(--roi)), rgb(var(--family)), rgb(var(--disrupt)))' }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        <main id="main" className="relative z-[2] mx-auto max-w-page px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8">
          {/* No exit animation: waiting on the old page while the new one is still loading could leave the screen blank. */}
          <motion.div
            key={location.pathname}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <PageErrorBoundary key={location.pathname}>
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </PageErrorBoundary>
          </motion.div>
        </main>
      </div>

      {/* mobile bottom bar */}
      <nav aria-label="Main" className="no-print glass fixed inset-x-0 bottom-0 z-30 flex border-t border-[rgb(var(--line)/var(--line-alpha))] pb-[env(safe-area-inset-bottom)] md:hidden">
        {bottom.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => cx('flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-neon' : 'text-muted')}>
            <i.icon className="h-5 w-5" aria-hidden />
            {i.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
          <Menu className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title="More">
        <MobileQuickSettings onDone={() => setMoreOpen(false)} />
        <div className="grid grid-cols-2 gap-2">
          {more.map((i) => (
            <Link key={i.to} to={i.to} onClick={() => setMoreOpen(false)} className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm font-medium hairline">
              <i.icon className="h-4 w-4 text-muted" aria-hidden />
              {i.label}
            </Link>
          ))}
        </div>
      </Dialog>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
      <Tour />
    </div>
  )
}

function MobileQuickSettings({ onDone }: { onDone: () => void }) {
  const { settings, update } = useSettings()
  const { logout } = useSession()
  const navigate = useNavigate()
  const dark = document.documentElement.dataset.theme !== 'light'
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select
        aria-label="Language for summaries and reports"
        value={settings.language}
        onChange={(e) => update({ language: e.target.value as Lang })}
        className="h-10 flex-1 rounded-xl bg-surface-2 px-3 text-sm hairline"
      >
        {LANGS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => update({ theme: dark ? 'light' : 'dark' })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm hairline">
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {dark ? 'Light' : 'Dark'}
      </button>
      <button
        type="button"
        onClick={() => {
          onDone()
          logout()
          navigate('/')
        }}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm hairline"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  )
}

/** Layout for signed-out pages (landing, sign in, how it works, trust). */
export function PublicShell({ children }: { children?: ReactNode }) {
  const { user } = useSession()
  const location = useLocation()
  return (
    <div className="grain min-h-dvh">
      <header className="no-print glass fixed inset-x-0 top-0 z-30 border-b border-[rgb(var(--line)/var(--line-alpha))]">
        <div className="mx-auto flex h-16 max-w-page items-center gap-4 px-4 md:px-8">
          <Logo />
          <nav aria-label="Site" className="ml-auto flex items-center gap-1 text-sm">
            <NavLink to="/how-it-works" className="hidden rounded-lg px-3 py-2 text-muted hover:text-ink sm:block">How it works</NavLink>
            <NavLink to="/trust" className="hidden rounded-lg px-3 py-2 text-muted hover:text-ink sm:block">How we know</NavLink>
            {user ? (
              <Link to="/home" className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-ink">Open PRISM</Link>
            ) : (
              <>
                <Link to="/signin" className="rounded-lg px-3 py-2 font-medium hover:text-ink">Sign in</Link>
                <Link to="/register" className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-ink">Create account</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div className="relative z-[2] pt-16">
        <PageErrorBoundary key={location.pathname}>
          <Suspense fallback={<div className="mx-auto max-w-page px-4 py-10"><PageSkeleton /></div>}>{children ?? <Outlet />}</Suspense>
        </PageErrorBoundary>
      </div>
    </div>
  )
}
