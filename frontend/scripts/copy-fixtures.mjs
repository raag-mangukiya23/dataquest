// Copies the backend's saved sample responses into src/fixtures for VITE_DATA_MODE=fixtures.
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
const src = new URL('../../backend/contracts/fixtures/', import.meta.url)
const dst = new URL('../src/fixtures/', import.meta.url)
mkdirSync(dst, { recursive: true })
let n = 0
for (const f of readdirSync(src)) if (f.endsWith('.json') && !f.startsWith('_')) { cpSync(new URL(f, src), new URL(f, dst)); n++ }
console.log(`copied ${n} fixtures`)
