/**
 * Minimal .env parser shared by `axil run` and `axil migrate`.
 *
 *   KEY=value            → "value"
 *   KEY="quoted value"   → "quoted value" (\n, \r, \t, \", \\ unescaped)
 *   KEY='literal'        → "literal" (no escapes)
 *   KEY=value # comment  → "value"
 *   export KEY=value     → "value"
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue

    out[m[1]] = unquote(m[2])
  }

  return out
}

function unquote(value: string): string {
  const v = value.trim()
  const q = v[0]

  if (q === '"' || q === "'" || q === '`') {
    const end = findClosingQuote(v, q)
    if (end !== -1) {
      const inner = v.slice(1, end)
      if (q !== '"') return inner
      return inner.replace(/\\([nrt"\\])/g, (_, c: string) =>
        c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c
      )
    }
  }

  // Unquoted: strip an inline " # comment"
  const hash = v.search(/\s#/)
  return (hash === -1 ? v : v.slice(0, hash)).trim()
}

function findClosingQuote(v: string, q: string): number {
  for (let i = 1; i < v.length; i++) {
    if (v[i] === '\\' && q === '"') { i++; continue }
    if (v[i] === q) return i
  }
  return -1
}

/** Parse `<cwd>/.env`; returns {} when the file does not exist. */
export function readEnvFile(cwd: string): Record<string, string> {
  const envPath = join(cwd, '.env')
  if (!existsSync(envPath)) return {}
  return parseEnv(readFileSync(envPath, 'utf-8'))
}

/** Copy `<cwd>/.env` into process.env without overriding existing variables. */
export function loadEnvIntoProcess(cwd: string): Record<string, string> {
  const vars = readEnvFile(cwd)
  for (const [k, v] of Object.entries(vars)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
  return vars
}
