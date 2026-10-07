// Friendly 404 with a small prism whose rays flicker as if looking for the path.
import { ArrowLeft, Compass, Home, LogIn } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PrismGlyph } from '@/components/landing/PrismGlyph'
import { SceneStyles } from '@/components/landing/PrismScene'
import { homeFor, useSession } from '@/state/session'

export default function NotFound() {
  const { user } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const home = user ? homeFor(user.role) : '/'

  useEffect(() => {
    document.title = 'Page not found · PRISM'
  }, [])

  const btn = 'inline-flex min-h-[48px] items-center gap-2 rounded-xl px-4 text-[15px] font-semibold'
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      <SceneStyles />
      <div data-theme="dark" className="relative mb-8 w-full max-w-sm overflow-hidden rounded-[28px] bg-bg px-6 py-8 hairline">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(260px 160px at 45% 50%, rgb(var(--primary) / 0.25), transparent 70%)' }} />
        <PrismGlyph lost className="relative h-auto w-full" label="A beam of light enters a prism and scatters, looking for a path." />
      </div>
      <p className="num text-sm font-semibold tracking-[0.3em] text-neon">404</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">This path doesn’t exist</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        The page you were looking for has moved or never existed. Every other path is still here.
      </p>
      <code className="num mt-4 max-w-full truncate rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted hairline" title={location.pathname}>
        {location.pathname}
      </code>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <Link to={home} className={`${btn} bg-primary text-primary-ink shadow-glow hover:brightness-110`}>
          <Home className="h-[18px] w-[18px]" aria-hidden /> {user ? 'Go to my home' : 'Go to the home page'}
        </Link>
        {window.history.length > 1 && (
          <button type="button" onClick={() => navigate(-1)} className={`${btn} bg-surface-2 hairline hover:bg-surface`}>
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden /> Go back
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1 text-sm">
        <Link to="/how-it-works" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-muted hover:text-ink">
          <Compass className="h-4 w-4" aria-hidden /> How PRISM works
        </Link>
        {!user && (
          <Link to="/signin" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-muted hover:text-ink">
            <LogIn className="h-4 w-4" aria-hidden /> Sign in
          </Link>
        )}
      </div>
    </div>
  )
}
