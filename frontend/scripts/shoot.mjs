// Screenshot harness for checking screens against the live backend.
//   node scripts/shoot.mjs --role parent --paths /results,/family --out ../shots [--widths 1440,390] [--theme dark]
// Roles: anon | student | parent | educator | admin  (demo accounts; the backend must run with --demo seed data).
// Writes <out>/<role>-<theme>-<width>-<path>.png and <out>/report-<role>-<theme>.json (console errors, failed API calls).
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const BASE = args.base || 'http://127.0.0.1:5173'
const role = args.role || 'anon'
const theme = args.theme || 'dark'
const out = args.out || '../shots'
const widths = (args.widths || '1440,390').split(',').map(Number)
const paths = (args.paths || '/').split(',')
const wait = Number(args.wait || 900)
const ACCOUNTS = {
  student: 'creative_risk_averse.student@prism.example',
  parent: 'creative_risk_averse.parent@prism.example',
  educator: 'counsellor@prism.example',
  admin: 'admin@prism.example',
}
mkdirSync(out, { recursive: true })

let tokens = null
if (role !== 'anon') {
  const email = args.email || ACCOUNTS[role]
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: args.password || 'Prism@Demo2026' }),
  })
  const body = await res.json()
  if (!body.success) throw new Error(`login failed for ${email}: ${JSON.stringify(body.error)}`)
  tokens = { access: body.data.tokens.access_token, refresh: body.data.tokens.refresh_token }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const report = { role, theme, pages: [] }
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: args.motion === 'reduce' ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([t, th]) => {
    try {
      sessionStorage.setItem('prism-boot', '1')
      if (t) sessionStorage.setItem('prism-tokens', JSON.stringify(t))
      const s = JSON.parse(localStorage.getItem('prism-settings') || '{}')
      localStorage.setItem('prism-settings', JSON.stringify({ ...s, theme: th, tourDone: true }))
    } catch {}
  }, [tokens, theme])
  const page = await ctx.newPage()
  for (const path of paths) {
    const entry = { path, width, console: [], failed: [] }
    const onConsole = (m) => (m.type() === 'error' || m.type() === 'warning') && entry.console.push(`${m.type()}: ${m.text()}`.slice(0, 400))
    const onError = (e) => entry.console.push(`pageerror: ${String(e)}`.slice(0, 400))
    const onResponse = (r) => r.url().includes('/api/') && r.status() >= 400 && entry.failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`)
    page.on('console', onConsole)
    page.on('pageerror', onError)
    page.on('response', onResponse)
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 })
    } catch (e) {
      entry.console.push(`navigation: ${String(e).slice(0, 200)}`)
    }
    await page.waitForTimeout(wait)
    const file = `${out}/${role}-${theme}-${width}-${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.png`
    await page.screenshot({ path: file, fullPage: true })
    entry.file = file
    entry.overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    page.off('console', onConsole)
    page.off('pageerror', onError)
    page.off('response', onResponse)
    report.pages.push(entry)
    console.log(`${width}px ${path} → ${file}${entry.console.length ? ` · ${entry.console.length} console` : ''}${entry.failed.length ? ` · ${entry.failed.length} failed API` : ''}${entry.overflowX ? ' · HORIZONTAL OVERFLOW' : ''}`)
  }
  await ctx.close()
}
await browser.close()
writeFileSync(`${out}/report-${role}-${theme}.json`, JSON.stringify(report, null, 2))
